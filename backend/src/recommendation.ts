import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  DiscoveredEventInput,
  EventRow,
  EventStore,
  PreferenceMemoryRow,
  ReviewRow,
} from "./database.js";
import {
  DuckDuckGoHtmlSearchProvider,
  sanitizeSearchTerms,
  type WebSearchProvider,
  type WebSearchResult,
} from "./duckduckgo.js";
import {
  extractEventsFromHtml,
  type ExtractedEvent,
} from "./event-extractor.js";
import { areaNameFromAddress } from "./event-display.js";
import {
  DuckDuckGoCoordinateResolver,
  GsiGeocoder,
  type Coordinates,
} from "./geocoding.js";
import { OllamaClient } from "./ollama.js";
import { fetchPublicHtml } from "./safe-fetch.js";
import {
  measureSearchTiming,
  type SearchDebugTimings,
  type SearchTimingCollector,
} from "./search-timing.js";
import {
  TransitApiClient,
  TransitApiError,
  type TransitRoute,
  type TravelMode,
} from "./transit.js";

export type RecommendedEvent = EventRow & {
  spotName: string;
  duration: string;
  cost: string;
  sourceUrl: string | null;
  travelMode: TravelMode;
  travelDurationMinutes: number;
  recommendationReason: string;
};

export type EventSearchResult = {
  events: RecommendedEvent[];
  total: number;
  meta: {
    personalized: boolean;
    source: "live" | "cache" | "database_fallback";
    generatedAt: string;
    routingProvider: "transit_api";
    geocodingProvider: "gsi";
    currentLocationProvider: "duckduckgo";
    degradedReasons: string[];
    travelAdvisory: string;
    debugTimings?: SearchDebugTimings;
  };
};

export interface EventRecommendationService {
  search(input: {
    userId: string;
    query: string;
    latitude: number;
    longitude: number;
    limit: number;
    offset: number;
    timings?: SearchTimingCollector;
  }): Promise<EventSearchResult>;
  indexReview(
    review: ReviewRow,
    event: EventRow & { tags: string[] },
  ): Promise<void>;
}

export type RecommendationConfig = {
  ollamaBaseUrl: string;
  ollamaChatModel: string;
  ollamaEmbeddingModel: string;
  ollamaRequestTimeoutMs?: number;
  transitApiBaseUrl?: string;
  searchTimeoutMs?: number;
  pageTimeoutMs?: number;
  cacheTtlMs?: number;
};

type RankedCandidate = {
  event: EventRow;
  route: TransitRoute;
  routeScore: number;
  queryScore: number;
  preferenceScore: number;
  timeScore: number;
  totalScore: number;
  memories: PreferenceMemoryRow[];
};

export interface CurrentLocationResolver {
  resolve(
    coordinates: Coordinates,
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ): Promise<string>;
}

export interface VenueGeocoder {
  geocode(address: string, signal?: AbortSignal): Promise<Coordinates>;
}

export interface RouteProvider {
  computeRoutes(
    origin: Coordinates,
    destinations: Coordinates[],
    departureAt: Date,
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ): Promise<(TransitRoute | null)[]>;
  resolveNearbyAreas?(
    destinations: Coordinates[],
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ): Promise<(string | null)[]>;
}

const preferenceTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(30)).max(8),
});

const reasonsSchema = z.object({
  reasons: z.array(
    z.object({ eventId: z.string(), reason: z.string().min(1).max(120) }),
  ),
});

const tagsJsonSchema = {
  type: "object",
  required: ["tags"],
  properties: {
    tags: { type: "array", maxItems: 8, items: { type: "string" } },
  },
} as const;

const reasonsJsonSchema = {
  type: "object",
  required: ["reasons"],
  properties: {
    reasons: {
      type: "array",
      items: {
        type: "object",
        required: ["eventId", "reason"],
        properties: {
          eventId: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export class LocalLlmRecommendationService implements EventRecommendationService {
  private readonly locationResolver: CurrentLocationResolver;
  private readonly venueGeocoder: VenueGeocoder;
  private readonly routes: RouteProvider;
  private readonly ollama: OllamaClient;
  private readonly webSearch: WebSearchProvider;
  private readonly searchTimeoutMs: number;
  private readonly pageTimeoutMs: number;
  private readonly cacheTtlMs: number;

  constructor(
    private readonly store: EventStore,
    config: RecommendationConfig,
    dependencies: {
      locationResolver?: CurrentLocationResolver;
      venueGeocoder?: VenueGeocoder;
      routes?: RouteProvider;
      ollama?: OllamaClient;
      webSearch?: WebSearchProvider;
    } = {},
  ) {
    this.ollama =
      dependencies.ollama ??
      new OllamaClient(
        config.ollamaBaseUrl,
        config.ollamaChatModel,
        config.ollamaEmbeddingModel,
        fetch,
        config.ollamaRequestTimeoutMs,
      );
    this.webSearch =
      dependencies.webSearch ?? new DuckDuckGoHtmlSearchProvider();
    this.locationResolver =
      dependencies.locationResolver ??
      new DuckDuckGoCoordinateResolver(this.webSearch, this.ollama);
    this.venueGeocoder = dependencies.venueGeocoder ?? new GsiGeocoder();
    this.routes =
      dependencies.routes ?? new TransitApiClient(config.transitApiBaseUrl);
    this.searchTimeoutMs = config.searchTimeoutMs ?? 120_000;
    this.pageTimeoutMs = config.pageTimeoutMs ?? 5_000;
    this.cacheTtlMs = config.cacheTtlMs ?? 15 * 60_000;
  }

  async search(input: {
    userId: string;
    query: string;
    latitude: number;
    longitude: number;
    limit: number;
    offset: number;
    timings?: SearchTimingCollector;
  }) {
    const signal = AbortSignal.timeout(this.searchTimeoutMs);
    const now = new Date();
    const bounds = tokyoDayBounds(now);
    const degradedReasons: string[] = [];
    const origin = { latitude: input.latitude, longitude: input.longitude };
    const memories = await measureSearchTiming(
      input.timings,
      "ragRecommendation",
      "preferenceMemoryLoadAndBackfill",
      () => this.backfillAndLoadMemories(input.userId, signal),
    );
    const preferenceKeywords = preferredKeywords(memories);
    let source: EventSearchResult["meta"]["source"] = "live";
    let area: string | null = null;
    try {
      area = await this.locationResolver.resolve(origin, signal, input.timings);
    } catch (error) {
      degradedReasons.push("current_location_resolution_unavailable");
      console.warn("DuckDuckGo locality resolution unavailable", error);
    }

    let events: EventRow[] = [];
    if (area) {
      try {
        const discovery = await this.discover({
          area,
          query: input.query,
          preferenceKeywords,
          bounds,
          now,
          signal,
          degradedReasons,
          timings: input.timings,
        });
        source = discovery.source;
        events = await this.store.upsertDiscoveredEvents(discovery.events);
      } catch (error) {
        degradedReasons.push("event_discovery_unavailable");
        console.warn("Live event discovery unavailable", error);
      }
    }

    if (!area) {
      input.timings?.skip("gemmaAnalysis", "current_location_unavailable");
      input.timings?.skip("eventPageFetch", "current_location_unavailable");
      input.timings?.skip("gsiGeocoding", "current_location_unavailable");
    }

    if (events.length === 0) {
      source = "database_fallback";
      events = await this.store.listActiveEvents({
        query: input.query === "イベント" ? "" : input.query,
        startsBefore: bounds.end,
        endsAfter: now,
        limit: 20,
      });
    }

    const candidates = events
      .filter((event) => isActiveToday(event, now, bounds))
      .slice(0, 20);
    if (candidates.length === 0) {
      input.timings?.skip("transitRouting", "no_candidates");
    }
    input.timings?.logStages([
      "duckDuckGoSearch",
      "eventPageFetch",
      "gemmaAnalysis",
      "gsiGeocoding",
    ]);
    let routes: (TransitRoute | null)[];
    try {
      routes = await this.routes.computeRoutes(
        origin,
        candidates.map((event) => ({
          latitude: event.latitude,
          longitude: event.longitude,
        })),
        now,
        signal,
        input.timings,
      );
    } catch (error) {
      input.timings?.logStages(["transitRouting"]);
      if (error instanceof TransitApiError) {
        throw new RoutingUnavailableError(error.message);
      }
      throw error;
    }
    const enrichedCandidates = await this.attachSpotNames(
      candidates,
      routes,
      signal,
      input.timings,
      degradedReasons,
    );
    input.timings?.logStages(["transitRouting"]);

    const routable = enrichedCandidates.flatMap((event, index) => {
      const route = routes[index];
      return route && route.durationSeconds <= 3_600 ? [{ event, route }] : [];
    });
    const ranked = await measureSearchTiming(
      input.timings,
      "ragRecommendation",
      "candidateEmbeddingVectorSearchAndRanking",
      () =>
        this.rank(
          routable,
          input.userId,
          input.query,
          memories,
          now,
          signal,
          degradedReasons,
        ),
    );
    const reasons = await measureSearchTiming(
      input.timings,
      "ragRecommendation",
      "recommendationReasonGeneration",
      () =>
        this.generateReasons(
          ranked,
          preferenceKeywords,
          signal,
          degradedReasons,
        ),
    );
    input.timings?.logStages(["ragRecommendation"]);
    const personalized = ranked.some(
      (candidate) => candidate.memories.length > 0,
    );
    const allEvents = ranked.map((candidate) => ({
      ...candidate.event,
      distance: formatDistance(candidate.route.distanceMeters),
      spotName: candidate.event.spotName ?? "周辺エリア情報なし",
      duration: formatRouteDuration(candidate.route),
      cost: formatTravelCost(candidate.route),
      sourceUrl: candidate.event.sourceUrl,
      travelMode: candidate.route.travelMode,
      travelDurationMinutes: Math.ceil(candidate.route.durationSeconds / 60),
      recommendationReason:
        reasons.get(candidate.event.id) ?? fallbackReason(candidate),
    }));
    try {
      await this.store.recordRecommendationLog({
        id: `rec_${randomUUID()}`,
        userId: input.userId,
        query: input.query,
        personalized,
        source,
        candidateScores: ranked.map((candidate) => ({
          eventId: candidate.event.id,
          route: candidate.routeScore,
          query: candidate.queryScore,
          preference: candidate.preferenceScore,
          time: candidate.timeScore,
          total: candidate.totalScore,
        })),
        chatModel: this.ollama.chatModel,
        embeddingModel: this.ollama.embeddingModel,
      });
    } catch (error) {
      degradedReasons.push("recommendation_log_unavailable");
      console.warn("Recommendation log persistence failed", error);
    }
    return {
      events: allEvents.slice(input.offset, input.offset + input.limit),
      total: allEvents.length,
      meta: {
        personalized,
        source,
        generatedAt: new Date().toISOString(),
        routingProvider: "transit_api" as const,
        geocodingProvider: "gsi" as const,
        currentLocationProvider: "duckduckgo" as const,
        degradedReasons: [...new Set(degradedReasons)],
        travelAdvisory:
          "乗換所要時間はTransit APIの旅程を使用します。会場最寄り駅から会場までの徒歩は、直線距離に基づく概算を所要時間に加算します。",
      },
    };
  }

  async indexReview(review: ReviewRow, event: EventRow & { tags: string[] }) {
    const memoryText = [
      `イベント: ${event.name}`,
      `概要: ${event.description}`,
      `タグ: ${event.tags.join("、")}`,
      `評価: ${review.rating}/5`,
      review.comment ? `感想: ${review.comment}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8_000);
    let tags = event.tags.slice(0, 8);
    try {
      const extracted = await this.ollama.json(
        {
          system:
            "レビューを外部送信しても個人情報にならない、一般的なイベント嗜好タグへ要約してください。人名、メール、電話番号、URL、場所の詳細は出力しないでください。",
          user: memoryText,
          schema: tagsJsonSchema,
        },
        preferenceTagsSchema,
      );
      tags = sanitizeTags(extracted.tags);
    } catch (error) {
      console.warn("Preference tag extraction failed", error);
    }
    try {
      const [embedding] = await this.ollama.embed([memoryText]);
      if (!embedding) throw new Error("Embedding was not returned");
      await this.store.savePreferenceMemory({
        reviewId: review.id,
        userId: review.userId,
        eventId: review.eventId,
        memoryText,
        preferenceTags: tags,
        rating: review.rating,
        embedding,
        embeddingModel: this.ollama.embeddingModel,
        embeddingStatus: "ready",
      });
    } catch (error) {
      console.warn("Preference embedding deferred", error);
      await this.store.savePreferenceMemory({
        reviewId: review.id,
        userId: review.userId,
        eventId: review.eventId,
        memoryText,
        preferenceTags: tags,
        rating: review.rating,
        embedding: null,
        embeddingModel: null,
        embeddingStatus: "pending",
      });
    }
  }

  private async attachSpotNames(
    events: EventRow[],
    routes: (TransitRoute | null)[],
    signal: AbortSignal,
    timings: SearchTimingCollector | undefined,
    degradedReasons: string[],
  ) {
    const routeNames = new Map<number, string>();
    events.forEach((event, index) => {
      const name = routes[index]?.nearbyAreaName?.trim();
      if (!event.spotName?.trim() && name) {
        routeNames.set(index, name.slice(0, 120));
      }
    });
    const unresolved = events
      .map((event, index) => ({ event, index }))
      .filter(
        ({ event, index }) => !event.spotName?.trim() && !routeNames.has(index),
      );
    const resolved = new Map<number, string>(routeNames);
    if (unresolved.length > 0 && this.routes.resolveNearbyAreas) {
      try {
        const names = await this.routes.resolveNearbyAreas(
          unresolved.map(({ event }) => ({
            latitude: event.latitude,
            longitude: event.longitude,
          })),
          signal,
          timings,
        );
        unresolved.forEach(({ index }, resultIndex) => {
          const name = names[resultIndex]?.trim();
          if (name) resolved.set(index, name.slice(0, 120));
        });
      } catch (error) {
        degradedReasons.push("nearby_area_resolution_unavailable");
        console.warn("Nearby station resolution unavailable", error);
      }
    }
    return Promise.all(
      events.map(async (event, index) => {
        const spotName =
          event.spotName?.trim() ||
          resolved.get(index) ||
          areaNameFromAddress(event.location) ||
          "周辺エリア情報なし";
        if (
          !event.spotName &&
          spotName !== "周辺エリア情報なし" &&
          this.store.updateEventSpotName
        ) {
          try {
            await this.store.updateEventSpotName(event.id, spotName);
          } catch (error) {
            degradedReasons.push("spot_name_persistence_unavailable");
            console.warn("Spot name persistence failed", error);
          }
        }
        return { ...event, spotName };
      }),
    );
  }

  private async discover(input: {
    area: string;
    query: string;
    preferenceKeywords: string[];
    bounds: { start: Date; end: Date; dateKey: string };
    now: Date;
    signal: AbortSignal;
    degradedReasons: string[];
    timings?: SearchTimingCollector;
  }) {
    const normalizedQuery = sanitizeSearchTerms(
      [input.query, ...input.preferenceKeywords].join(" "),
    );
    const cacheKey = createHash("sha256")
      .update(`${input.bounds.dateKey}\n${input.area}\n${normalizedQuery}`)
      .digest("hex");
    const cached = await this.store.getDiscoveryCache(cacheKey);
    if (cached) {
      input.timings?.skip("eventPageFetch", "discovery_cache_hit");
      input.timings?.skip("gsiGeocoding", "discovery_cache_hit");
      return { events: cached.payload, source: "cache" as const };
    }

    const executeSearch = (requestedQuery: string, signal?: AbortSignal) => {
      const finalQuery = sanitizeSearchTerms(
        `${input.area} ${input.bounds.dateKey} ${requestedQuery}`,
      );
      return measureSearchTiming(
        input.timings,
        "duckDuckGoSearch",
        "eventDiscoverySearch",
        () => this.webSearch.search(finalQuery, 8, signal),
      );
    };
    let searchResults: WebSearchResult[] = [];
    try {
      searchResults = await this.ollama.searchWithTool(
        {
          area: input.area,
          date: input.bounds.dateKey,
          query: input.query,
          preferenceKeywords: input.preferenceKeywords,
        },
        executeSearch,
        input.signal,
        input.timings,
      );
    } catch (error) {
      input.degradedReasons.push("ollama_search_planning_unavailable");
      console.warn("Ollama search planning unavailable", error);
    }
    if (searchResults.length === 0) {
      searchResults = await executeSearch(
        `${input.query} ${input.preferenceKeywords.join(" ")} イベント`,
        input.signal,
      );
    }
    if (searchResults.length === 0) {
      input.timings?.skip("eventPageFetch", "no_search_results");
      input.timings?.skip("gsiGeocoding", "no_search_results");
    }
    const pages = await Promise.allSettled(
      searchResults.slice(0, 8).map(async (result) => {
        const page = await measureSearchTiming(
          input.timings,
          "eventPageFetch",
          "publicPageFetch",
          () =>
            fetchPublicHtml(result.url, {
              signal: input.signal,
              timeoutMs: this.pageTimeoutMs,
            }),
        );
        try {
          return await extractEventsFromHtml({
            sourceUrl: page.url,
            html: page.html,
            ollama: this.ollama,
            signal: input.signal,
            timings: input.timings,
          });
        } catch (error) {
          input.degradedReasons.push("ollama_extraction_unavailable");
          console.warn("LLM extraction failed", error);
          return extractEventsFromHtml({
            sourceUrl: page.url,
            html: page.html,
            signal: input.signal,
          });
        }
      }),
    );
    const extracted = deduplicateExtractedEvents(
      pages.flatMap((page) => (page.status === "fulfilled" ? page.value : [])),
    )
      .filter(
        (event) =>
          event.startsAt < input.bounds.end && event.endsAt > input.now,
      )
      .slice(0, 20);
    if (extracted.length === 0) {
      input.timings?.skip("gsiGeocoding", "no_extractable_events");
    }
    const geocoded: { event: ExtractedEvent; coordinates: Coordinates }[] = [];
    for (const event of extracted) {
      try {
        geocoded.push({
          event,
          coordinates: await measureSearchTiming(
            input.timings,
            "gsiGeocoding",
            "venueAddressGeocoding",
            () => this.venueGeocoder.geocode(event.address, input.signal),
          ),
        });
      } catch (error) {
        input.degradedReasons.push("gsi_geocoding_failed");
        console.warn("GSI venue geocoding failed", {
          address: event.address,
          error,
        });
      }
    }
    const embeddings = await this.embedBestEffort(
      geocoded.map(({ event }) => eventEmbeddingText(event)),
      input.signal,
      input.degradedReasons,
    );
    const events = geocoded.map(({ event, coordinates }, index) =>
      toDiscoveredEvent(
        event,
        coordinates,
        embeddings[index] ?? null,
        this.ollama.embeddingModel,
      ),
    );
    await this.store.setDiscoveryCache({
      cacheKey,
      query: normalizedQuery,
      area: input.area,
      payload: events,
      expiresAt: new Date(Date.now() + this.cacheTtlMs),
    });
    return { events, source: "live" as const };
  }

  private async backfillAndLoadMemories(userId: string, signal: AbortSignal) {
    let memories = await this.store.listPreferenceMemories(userId, 20);
    const pending = memories.filter(
      (memory) => memory.embeddingStatus !== "ready" || !memory.embedding,
    );
    if (pending.length > 0) {
      try {
        const embeddings = await this.ollama.embed(
          pending.map((memory) => memory.memoryText),
          signal,
        );
        await Promise.all(
          pending.map((memory, index) => {
            const embedding = embeddings[index];
            if (!embedding) return Promise.resolve();
            return this.store.savePreferenceMemory({
              reviewId: memory.reviewId,
              userId: memory.userId,
              eventId: memory.eventId,
              memoryText: memory.memoryText,
              preferenceTags: memory.preferenceTags,
              rating: memory.rating,
              embedding,
              embeddingModel: this.ollama.embeddingModel,
              embeddingStatus: "ready",
            });
          }),
        );
        memories = await this.store.listPreferenceMemories(userId, 20);
      } catch (error) {
        console.warn("Pending preference embeddings remain deferred", error);
      }
    }
    return memories;
  }

  private async rank(
    candidates: { event: EventRow; route: TransitRoute }[],
    userId: string,
    query: string,
    memories: PreferenceMemoryRow[],
    now: Date,
    signal: AbortSignal,
    degradedReasons: string[],
  ) {
    const texts = [
      query,
      ...candidates.map(({ event }) => eventEmbeddingText(event)),
    ];
    const embeddings = await this.embedBestEffort(
      texts,
      signal,
      degradedReasons,
    );
    const queryEmbedding = embeddings[0] ?? null;
    const eventEmbeddings = embeddings.slice(1);
    const hasReadyMemories = memories.some(
      (memory) => memory.embeddingStatus === "ready" && memory.embedding,
    );
    const ranked = await Promise.all(
      candidates.map(
        async ({ event, route }, index): Promise<RankedCandidate> => {
          const eventEmbedding = eventEmbeddings[index] ?? null;
          if (eventEmbedding) {
            await this.store.setEventEmbedding(
              event.id,
              eventEmbedding,
              this.ollama.embeddingModel,
            );
          }
          const similar = eventEmbedding
            ? await this.store.findSimilarPreferenceMemories(
                userId,
                eventEmbedding,
                5,
              )
            : [];
          const routeScore = clamp01(1 - route.durationSeconds / 3_600);
          const queryScore =
            queryEmbedding && eventEmbedding
              ? clamp01(
                  (cosineSimilarity(queryEmbedding, eventEmbedding) + 1) / 2,
                )
              : textRelevance(query, event);
          const preferenceScore = similar.length
            ? clamp01(
                (average(
                  similar.map(
                    (memory) =>
                      (memory.similarity ?? 0) * ((memory.rating - 3) / 2),
                  ),
                ) +
                  1) /
                  2,
              )
            : 0.5;
          const timeScore = event.startsAt
            ? clamp01(
                1 -
                  (event.startsAt.getTime() - now.getTime()) / (12 * 3_600_000),
              )
            : 0;
          const totalScore = hasReadyMemories
            ? routeScore * 0.35 +
              queryScore * 0.25 +
              preferenceScore * 0.3 +
              timeScore * 0.1
            : routeScore * 0.5 + queryScore * 0.35 + timeScore * 0.15;
          return {
            event,
            route,
            routeScore,
            queryScore,
            preferenceScore,
            timeScore,
            totalScore,
            memories: similar,
          };
        },
      ),
    );
    return ranked.sort((left, right) => right.totalScore - left.totalScore);
  }

  private async generateReasons(
    candidates: RankedCandidate[],
    preferenceKeywords: string[],
    signal: AbortSignal,
    degradedReasons: string[],
  ) {
    if (candidates.length === 0) return new Map<string, string>();
    try {
      const result = await this.ollama.json(
        {
          system:
            "イベント候補ごとに、移動時間と一般化された嗜好タグを根拠に、簡潔な日本語の推薦理由を1文で作成してください。入力にない事実を追加しないでください。",
          user: JSON.stringify({
            preferenceKeywords,
            events: candidates.map((candidate) => ({
              eventId: candidate.event.id,
              description: candidate.event.description,
              travelMinutes: Math.ceil(candidate.route.durationSeconds / 60),
              travelMode: candidate.route.travelMode,
              preferenceScore: candidate.preferenceScore,
            })),
          }),
          schema: reasonsJsonSchema,
        },
        reasonsSchema,
        signal,
      );
      return new Map(
        result.reasons.map(({ eventId, reason }) => [eventId, reason.trim()]),
      );
    } catch (error) {
      degradedReasons.push("recommendation_reason_unavailable");
      console.warn("Recommendation reason generation failed", error);
      return new Map<string, string>();
    }
  }

  private async embedBestEffort(
    texts: string[],
    signal: AbortSignal,
    degradedReasons: string[],
  ) {
    if (texts.length === 0) return [];
    try {
      return await this.ollama.embed(texts, signal);
    } catch (error) {
      degradedReasons.push("embedding_unavailable");
      console.warn("Embedding unavailable", error);
      return texts.map(() => null);
    }
  }
}

export class RoutingUnavailableError extends Error {}

function toDiscoveredEvent(
  event: ExtractedEvent,
  coordinates: Coordinates,
  embedding: number[] | null,
  embeddingModel: string,
): DiscoveredEventInput {
  const sourceFingerprint = createHash("sha256")
    .update(
      `${event.sourceUrl}\n${event.name}\n${event.startsAt.toISOString()}`,
    )
    .digest("hex");
  return {
    id: `evt_${sourceFingerprint.slice(0, 24)}`,
    name: event.name,
    spotName: null,
    location: event.address,
    imageUri: event.imageUri,
    description: event.description || event.name,
    detailedDescription: event.contentText.slice(0, 5_000) || event.description,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    organizerName: event.organizerName,
    organizerContactEmail: event.organizerContactEmail,
    sourceProvider: "duckduckgo_html",
    sourceUrl: event.sourceUrl,
    sourceFingerprint,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    contentText: event.contentText,
    tags: event.tags,
    embedding,
    embeddingModel: embedding ? embeddingModel : null,
  };
}

function tokyoDayBounds(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  return {
    dateKey,
    start,
    end: new Date(start.getTime() + 24 * 3_600_000),
  };
}

function isActiveToday(event: EventRow, now: Date, bounds: { end: Date }) {
  return Boolean(
    event.startsAt &&
    event.endsAt &&
    event.startsAt < bounds.end &&
    event.endsAt > now,
  );
}

function preferredKeywords(memories: PreferenceMemoryRow[]) {
  const scores = new Map<string, number>();
  for (const memory of memories) {
    for (const tag of sanitizeTags(memory.preferenceTags)) {
      scores.set(tag, (scores.get(tag) ?? 0) + memory.rating - 3);
    }
  }
  return [...scores]
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([tag]) => tag);
}

function sanitizeTags(tags: string[]) {
  return [
    ...new Set(
      tags
        .map(sanitizeSearchTerms)
        .filter((tag) => tag.length >= 1 && tag.length <= 30),
    ),
  ].slice(0, 8);
}

function deduplicateExtractedEvents(events: ExtractedEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.sourceUrl}\n${event.name}\n${event.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function eventEmbeddingText(
  event: Pick<EventRow, "name" | "description" | "location"> | ExtractedEvent,
) {
  return `${event.name}\n${event.description}\n${event.location}`.slice(
    0,
    8_000,
  );
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftLength += leftValue * leftValue;
    rightLength += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftLength) * Math.sqrt(rightLength);
  return denominator === 0 ? 0 : dot / denominator;
}

function textRelevance(query: string, event: EventRow) {
  if (query === "イベント") return 0.5;
  const target =
    `${event.name} ${event.location} ${event.description}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  return words.length === 0
    ? 0.5
    : words.filter((word) => target.includes(word)).length / words.length;
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatDistance(meters: number) {
  return meters < 1_000
    ? `${Math.round(meters)} m`
    : `${(meters / 1_000).toFixed(1)} km`;
}

export function formatTravelDuration(durationSeconds: number) {
  return `約${Math.ceil(durationSeconds / 60)}分`;
}

function formatRouteDuration(route: TransitRoute) {
  const duration = formatTravelDuration(route.durationSeconds);
  const walkingMinutes = Math.ceil((route.destinationWalkSeconds ?? 0) / 60);
  return walkingMinutes > 0
    ? `${duration}（会場まで徒歩約${walkingMinutes}分含む）`
    : duration;
}

export function formatTravelCost(route: TransitRoute) {
  if (route.travelMode === "WALK") return "0円";
  if (!route.fare) return "料金情報なし";
  const usesIc = route.fare.ic !== null;
  const amount = usesIc ? route.fare.ic! : route.fare.ticket;
  const formatted = Number.isInteger(amount)
    ? amount.toLocaleString("ja-JP")
    : amount.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  const price =
    route.fare.currency.toUpperCase() === "JPY"
      ? `${formatted}円`
      : `${formatted} ${route.fare.currency.toUpperCase()}`;
  return `${price}（${usesIc ? "IC" : "きっぷ"}）`;
}

function fallbackReason(candidate: RankedCandidate) {
  const minutes = Math.ceil(candidate.route.durationSeconds / 60);
  return `Transit APIの最短旅程で約${minutes}分、当日参加できるイベントです。`;
}
