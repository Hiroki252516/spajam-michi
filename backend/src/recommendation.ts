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
import { type ExtractedEvent } from "./event-extractor.js";
import { canonicalPageUrl, EventPageCrawler } from "./event-pages.js";
import {
  closingTime,
  eventIdentity,
  isDetailedAddress,
  isSpecificVenueName,
  neighborhoodName,
  normalizeSearchArea,
  uniqueEvents,
  verifiedVenue,
} from "./event-quality.js";
import { GsiGeocoder, type Coordinates } from "./geocoding.js";
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

const MAX_EVENT_PAGES_PER_SEARCH = 4;
const MAX_ALTERNATE_EVENT_PAGES = 2;

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
    currentLocationProvider: "device_geocoder";
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
    area: string;
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
  private readonly venueGeocoder: VenueGeocoder;
  private readonly routes: RouteProvider;
  private readonly ollama: OllamaClient;
  private readonly webSearch: WebSearchProvider;
  private readonly searchTimeoutMs: number;
  private readonly pageTimeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly pageFetcher: typeof fetchPublicHtml;

  constructor(
    private readonly store: EventStore,
    config: RecommendationConfig,
    dependencies: {
      venueGeocoder?: VenueGeocoder;
      routes?: RouteProvider;
      ollama?: OllamaClient;
      webSearch?: WebSearchProvider;
      pageFetcher?: typeof fetchPublicHtml;
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
    this.venueGeocoder = dependencies.venueGeocoder ?? new GsiGeocoder();
    this.routes =
      dependencies.routes ?? new TransitApiClient(config.transitApiBaseUrl);
    this.searchTimeoutMs = config.searchTimeoutMs ?? 120_000;
    this.pageTimeoutMs = config.pageTimeoutMs ?? 5_000;
    this.cacheTtlMs = config.cacheTtlMs ?? 15 * 60_000;
    this.pageFetcher = dependencies.pageFetcher ?? fetchPublicHtml;
  }

  async search(input: {
    userId: string;
    query: string;
    latitude: number;
    longitude: number;
    area: string;
    limit: number;
    offset: number;
    timings?: SearchTimingCollector;
  }) {
    const signal = AbortSignal.timeout(this.searchTimeoutMs);
    const discoverySignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.min(75_000, this.searchTimeoutMs * 0.625)),
    ]);
    const area = normalizeSearchArea(input.area);
    if (!area) throw new Error("Current municipality is required");
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
    const currentLocationProvider = "device_geocoder" as const;

    let events: EventRow[] = [];
    if (area) {
      try {
        const discovery = await this.discover({
          area,
          query: input.query,
          preferenceKeywords,
          bounds,
          now,
          signal: discoverySignal,
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

    const candidateTime = new Date();
    const candidateBounds = tokyoDayBounds(candidateTime);
    if (events.length === 0) {
      source = "database_fallback";
      events = await this.store.listActiveEvents({
        query: input.query === "イベント" ? "" : input.query,
        startsBefore: candidateBounds.end,
        endsAfter: candidateTime,
        origin,
        limit: 100,
      });
    }

    const candidates = uniqueEvents(
      events.filter(
        (event) =>
          verifiedVenue(event, candidateTime) &&
          isActiveToday(event, candidateTime, candidateBounds) &&
          (closingTime(event, candidateTime)?.getTime() ?? Infinity) >
            candidateTime.getTime(),
      ),
    ).slice(0, 20);
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
    const departureAt = new Date();
    try {
      routes = await this.routes.computeRoutes(
        origin,
        candidates.map((event) => ({
          latitude: event.latitude,
          longitude: event.longitude,
        })),
        departureAt,
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
      degradedReasons,
    );
    input.timings?.logStages(["transitRouting"]);

    const routable = enrichedCandidates.flatMap((event, index) => {
      const route = routes[index];
      const close = closingTime(event, departureAt) ?? event.endsAt;
      return route &&
        route.durationSeconds <= 3_600 &&
        (!close ||
          departureAt.getTime() + route.durationSeconds * 1000 <
            close.getTime())
        ? [{ event, route }]
        : [];
    });
    console.info("Event search routing completed", {
      activeCandidateCount: candidates.length,
      routesFoundCount: routes.filter((route) => route !== null).length,
      withinOneHourRouteCount: routable.length,
    });
    if (candidates.length === 0) degradedReasons.push("no_verified_events");
    else if (routable.length === 0) degradedReasons.push("no_reachable_events");
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
    console.info("Event search ranking completed", {
      routableCount: routable.length,
      rankedCount: ranked.length,
    });
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
        currentLocationProvider,
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
    degradedReasons: string[],
  ) {
    return Promise.all(
      events.map(async (event, index) => {
        const station = routes[index]?.nearbyAreaName?.trim();
        const spotName =
          station && /(?:駅|停留所)周辺$/u.test(station)
            ? station
            : neighborhoodName(event.location);
        if (spotName !== event.spotName && this.store.updateEventSpotName) {
          try {
            await this.store.updateEventSpotName(event.id, spotName);
          } catch {
            degradedReasons.push("spot_name_persistence_unavailable");
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
      .update(
        `verified-v2\n${input.bounds.dateKey}\n${input.area}\n${normalizedQuery}`,
      )
      .digest("hex");
    const cached = await this.store.getDiscoveryCache(cacheKey);
    const cachedEvents =
      cached?.payload.filter((event) => verifiedVenue(event, input.now)) ?? [];
    if (cachedEvents.length > 0) {
      input.timings?.skip("eventPageFetch", "discovery_cache_hit");
      input.timings?.skip("gsiGeocoding", "discovery_cache_hit");
      return { events: cachedEvents, source: "cache" as const };
    }
    const onIssue = (reason: string) => input.degradedReasons.push(reason);
    const executeSearch = (requestedQuery: string, signal = input.signal) =>
      measureSearchTiming(
        input.timings,
        "duckDuckGoSearch",
        "eventDiscoverySearch",
        () =>
          this.webSearch.search(
            sanitizeSearchTerms(`${input.area} ${requestedQuery}`),
            8,
            signal,
            onIssue,
          ),
      );
    let searchResults: WebSearchResult[] = [];
    try {
      searchResults = await executeSearch(`${normalizedQuery} イベント`);
    } catch {
      onIssue(
        input.signal.aborted
          ? "event_discovery_timeout"
          : "event_search_unavailable",
      );
    }
    // Broaden before a single site's descendants consume the page budget.
    if (searchResults.length < 20 && !input.signal.aborted) {
      try {
        searchResults.push(
          ...(await executeSearch(
            `今日 開催イベント ${input.query === "イベント" ? "" : input.query}`,
          )),
        );
      } catch {
        onIssue(
          input.signal.aborted
            ? "event_discovery_timeout"
            : "event_search_unavailable",
        );
      }
    }
    if (!searchResults.length && !input.signal.aborted) {
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
      } catch {
        onIssue("ollama_search_planning_unavailable");
      }
    }
    const eligibleRoots = searchResults.filter((result) => {
      try {
        return !/^(?:www\.)?google\.|^map\.yahoo\.|^maps\./u.test(
          new URL(result.url).hostname,
        );
      } catch {
        return false;
      }
    });
    const rootPriority = (result: WebSearchResult) => {
      const url = new URL(result.url);
      if (url.hostname === "www.walkerplus.com")
        return /^\/event\//u.test(url.pathname) ? 0 : 1;
      return /\/(?:events?|eventinfo)\//u.test(url.pathname) ? 2 : 3;
    };
    const seenRoots = new Set<string>();
    const roots = eligibleRoots
      .sort((left, right) => rootPriority(left) - rootPriority(right))
      .filter((result) => {
        const key = canonicalSearchUrl(result);
        if (seenRoots.has(key)) return false;
        seenRoots.add(key);
        return true;
      });
    const crawler = new EventPageCrawler({
      signal: input.signal,
      timeoutMs: this.pageTimeoutMs,
      ollama: this.ollama,
      timings: input.timings,
      onIssue,
      fetchPage: this.pageFetcher,
    });
    await crawler.crawl(
      selectDiverseSearchResults(
        roots,
        MAX_EVENT_PAGES_PER_SEARCH + MAX_ALTERNATE_EVENT_PAGES,
      ).map((result) => result.url),
    );
    const active = (events: ExtractedEvent[]) =>
      events.filter(
        (event) =>
          event.startsAt < input.bounds.end && event.endsAt > input.now,
      );
    const parsed = active(crawler.events());
    const events: DiscoveredEventInput[] = [];
    for (const event of parsed) {
      if (input.signal.aborted && !event.sourceCoordinates) {
        onIssue("event_discovery_timeout");
        continue;
      }
      const detailedAddress = isDetailedAddress(event.address);
      const specificVenue = isSpecificVenueName(event.location);
      if (!detailedAddress && !(event.sourceCoordinates && specificVenue)) {
        onIssue("venue_address_unverified");
        continue;
      }
      try {
        const coordinates =
          event.sourceCoordinates ??
          (await measureSearchTiming(
            input.timings,
            "gsiGeocoding",
            "venueAddressGeocoding",
            () => this.venueGeocoder.geocode(event.address, input.signal),
          ));
        events.push({
          ...toDiscoveredEvent(
            event,
            coordinates,
            null,
            this.ollama.embeddingModel,
          ),
          venueName: event.location,
          venueVerified: true,
          venueVerifiedAt: new Date(),
          coordinateSource: event.sourceCoordinates
            ? "source_page"
            : "gsi_address",
          coordinateSourceUrl: event.sourceCoordinates
            ? (event.coordinateSourceUrl ?? event.sourceUrl)
            : event.sourceUrl,
          timePrecision: event.timePrecision,
          hoursText: event.hoursText,
        });
      } catch {
        onIssue(
          input.signal.aborted
            ? "event_discovery_timeout"
            : "venue_coordinates_unverified",
        );
      }
    }
    console.info("Verified event discovery completed", {
      searchResultCount: searchResults.length,
      ...crawler.counts(),
      verifiedEvents: events.length,
    });
    if (!searchResults.length)
      input.timings?.skip("eventPageFetch", "no_search_results");
    if (!events.length)
      input.timings?.skip("gsiGeocoding", "no_verified_events");
    const unique = uniqueEvents(events);
    await this.store.setDiscoveryCache({
      cacheKey,
      query: normalizedQuery,
      area: input.area,
      payload: unique,
      expiresAt: new Date(Date.now() + (unique.length ? this.cacheTtlMs : -1)),
    });
    return { events: unique, source: "live" as const };
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

function canonicalSearchUrl(result: WebSearchResult) {
  try {
    return canonicalPageUrl(result.url);
  } catch {
    return "";
  }
}

function selectDiverseSearchResults(results: WebSearchResult[], limit: number) {
  const selected: WebSearchResult[] = [];
  const selectedPerHost = new Map<string, number>();
  let pass = 0;
  while (selected.length < limit) {
    let addedOnPass = false;
    for (const result of results) {
      let host: string;
      try {
        host = new URL(result.url).hostname;
      } catch {
        continue;
      }
      if ((selectedPerHost.get(host) ?? 0) !== pass) continue;
      selected.push(result);
      selectedPerHost.set(host, pass + 1);
      addedOnPass = true;
      if (selected.length >= limit) break;
    }
    if (!addedOnPass) break;
    pass += 1;
  }
  return selected;
}

function toDiscoveredEvent(
  event: ExtractedEvent,
  coordinates: Coordinates,
  embedding: number[] | null,
  embeddingModel: string,
): DiscoveredEventInput {
  const sourceFingerprint = eventIdentity({
    ...event,
    location: event.address,
  });
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
