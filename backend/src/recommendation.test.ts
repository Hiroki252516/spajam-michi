import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  DiscoveredEventInput,
  EventRow,
  EventStore,
  PreferenceMemoryRow,
} from "./database.js";
import type { WebSearchProvider } from "./duckduckgo.js";
import { areaNameFromAddress } from "./event-display.js";
import { OllamaClient } from "./ollama.js";
import {
  formatTravelCost,
  formatTravelDuration,
  LocalLlmRecommendationService,
  type RouteProvider,
} from "./recommendation.js";
import { SearchTimingCollector } from "./search-timing.js";

describe("local LLM recommendation service", () => {
  it("formats route duration and fares without guessing unknown transit fares", () => {
    const baseRoute = {
      destinationIndex: 0,
      travelMode: "TRANSIT" as const,
      distanceMeters: 1_000,
      durationSeconds: 1_401,
    };
    assert.equal(formatTravelDuration(baseRoute.durationSeconds), "約24分");
    assert.equal(
      formatTravelCost({
        ...baseRoute,
        fare: { currency: "JPY", ticket: 180, ic: 178 },
      }),
      "178円（IC）",
    );
    assert.equal(
      formatTravelCost({
        ...baseRoute,
        fare: { currency: "JPY", ticket: 180, ic: null },
      }),
      "180円（きっぷ）",
    );
    assert.equal(
      formatTravelCost({ ...baseRoute, fare: null }),
      "料金情報なし",
    );
    assert.equal(
      formatTravelCost({ ...baseRoute, travelMode: "WALK", fare: null }),
      "0円",
    );
  });

  it("uses a municipality as a non-identifying area fallback", () => {
    assert.equal(areaNameFromAddress("東京都渋谷区神宮前1-2-3"), "渋谷区周辺");
    assert.equal(areaNameFromAddress("大阪府大阪市北区梅田"), "大阪市周辺");
    assert.equal(areaNameFromAddress("会場名のみ"), null);
  });

  it("uses cached discovery and promotes highly rated similar events", async () => {
    const now = new Date();
    const discovered = [
      discoveredEvent("evt-a", "音楽フェス", now, 35.66, 139.7),
      discoveredEvent("evt-b", "苦手な展示", now, 35.67, 139.71),
    ];
    const positive = preferenceMemory("review-a", "evt-old-a", 5, vector(1, 0));
    const negative = preferenceMemory("review-b", "evt-old-b", 1, vector(0, 1));
    let loggedPersonalized = false;
    const persistedSpotNames = new Map<string, string>();
    const store = {
      listPreferenceMemories: async () => [positive, negative],
      getDiscoveryCache: async () => ({
        payload: discovered,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      upsertDiscoveredEvents: async (events: DiscoveredEventInput[]) =>
        events.map(toEventRow),
      listActiveEvents: async () => [],
      setEventEmbedding: async () => undefined,
      updateEventSpotName: async (eventId: string, spotName: string) => {
        persistedSpotNames.set(eventId, spotName);
      },
      findSimilarPreferenceMemories: async (
        _userId: string,
        embedding: number[],
      ) => (embedding[0]! > embedding[1]! ? [positive] : [negative]),
      recordRecommendationLog: async (input: { personalized: boolean }) => {
        loggedPersonalized = input.personalized;
      },
    } as unknown as EventStore;
    const ollama = new OllamaClient(
      "http://127.0.0.1:11434",
      "gemma4:e2b",
      "embeddinggemma:300m-qat-q4_0",
      ollamaFetchStub(),
    );
    const noWebSearch: WebSearchProvider = {
      search: async () => {
        throw new Error("cache should prevent web search");
      },
    };
    const service = new LocalLlmRecommendationService(
      store,
      {
        ollamaBaseUrl: "http://127.0.0.1:11434",
        ollamaChatModel: "gemma4:e2b",
        ollamaEmbeddingModel: "embeddinggemma:300m-qat-q4_0",
      },
      {
        locationResolver: { resolve: async () => "東京都 渋谷区" },
        routes: {
          ...routeProvider(1_800, undefined, 300, "渋谷駅周辺"),
          resolveNearbyAreas: async (destinations) =>
            destinations.map(() => "渋谷駅周辺"),
        },
        ollama,
        webSearch: noWebSearch,
      },
    );
    const timings = new SearchTimingCollector("job-cache", undefined, () => {});
    const result = await service.search({
      userId: "user-1",
      query: "イベント",
      latitude: 35.65,
      longitude: 139.69,
      limit: 10,
      offset: 0,
      timings,
    });
    assert.equal(result.meta.source, "cache");
    assert.equal(result.meta.personalized, true);
    assert.equal(result.events[0]?.id, "evt-a");
    assert.equal(result.events[0]?.spotName, "渋谷駅周辺");
    assert.equal(persistedSpotNames.get("evt-a"), "渋谷駅周辺");
    assert.equal(result.events[0]?.duration, "約35分（会場まで徒歩約5分含む）");
    assert.equal(result.events[0]?.travelDurationMinutes, 35);
    assert.equal(result.events[0]?.cost, "料金情報なし");
    assert.equal(loggedPersonalized, true);
    const timingResult = timings.snapshot();
    assert.equal(
      timingResult.stages.eventPageFetch.skipReason,
      "discovery_cache_hit",
    );
    assert.equal(
      timingResult.stages.gsiGeocoding.skipReason,
      "discovery_cache_hit",
    );
    assert.equal(timingResult.stages.ragRecommendation.status, "completed");
  });

  it("keeps a review pending when Ollama is unavailable", async () => {
    const saved: Omit<PreferenceMemoryRow, "similarity">[] = [];
    const store = {
      savePreferenceMemory: async (
        memory: Omit<PreferenceMemoryRow, "similarity">,
      ) => {
        saved.push(memory);
      },
    } as unknown as EventStore;
    const unavailableFetch = (async () =>
      new Response("unavailable", { status: 503 })) as typeof fetch;
    const service = new LocalLlmRecommendationService(
      store,
      {
        ollamaBaseUrl: "http://127.0.0.1:11434",
        ollamaChatModel: "gemma4:e2b",
        ollamaEmbeddingModel: "embeddinggemma:300m-qat-q4_0",
      },
      {
        ollama: new OllamaClient(
          "http://127.0.0.1:11434",
          "gemma4:e2b",
          "embeddinggemma:300m-qat-q4_0",
          unavailableFetch,
        ),
      },
    );
    await service.indexReview(
      {
        id: "review-1",
        eventId: "evt-a",
        userId: "user-1",
        rating: 5,
        comment: "また参加したい",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        ...toEventRow(
          discoveredEvent("evt-a", "音楽フェス", new Date(), 35, 139),
        ),
        tags: ["音楽"],
      },
    );
    assert.equal(saved[0]?.embeddingStatus, "pending");
    assert.equal(saved[0]?.embedding, null);
  });

  it("excludes ended, next-day, and over-60-minute events", async () => {
    const now = new Date();
    const active = discoveredEvent("evt-active", "開催中", now, 35.66, 139.7);
    const ended = {
      ...discoveredEvent("evt-ended", "終了済み", now, 35.67, 139.71),
      startsAt: new Date(now.getTime() - 2 * 3_600_000),
      endsAt: new Date(now.getTime() - 3_600_000),
    };
    const tomorrow = {
      ...discoveredEvent("evt-tomorrow", "翌日", now, 35.68, 139.72),
      startsAt: new Date(now.getTime() + 24 * 3_600_000),
      endsAt: new Date(now.getTime() + 25 * 3_600_000),
    };
    let routedDestinations = 0;
    const store = {
      listPreferenceMemories: async () => [],
      getDiscoveryCache: async () => ({
        payload: [active, ended, tomorrow],
        expiresAt: new Date(Date.now() + 60_000),
      }),
      upsertDiscoveredEvents: async (events: DiscoveredEventInput[]) =>
        events.map(toEventRow),
      listActiveEvents: async () => [],
      setEventEmbedding: async () => undefined,
      findSimilarPreferenceMemories: async () => [],
      recordRecommendationLog: async () => undefined,
    } as unknown as EventStore;
    const ollama = new OllamaClient(
      "http://127.0.0.1:11434",
      "gemma4:e2b",
      "embeddinggemma:300m-qat-q4_0",
      ollamaFetchStub(),
    );
    const service = new LocalLlmRecommendationService(
      store,
      {
        ollamaBaseUrl: "http://127.0.0.1:11434",
        ollamaChatModel: "gemma4:e2b",
        ollamaEmbeddingModel: "embeddinggemma:300m-qat-q4_0",
      },
      {
        locationResolver: { resolve: async () => "東京都 渋谷区" },
        routes: routeProvider(
          3_500,
          (count) => {
            routedDestinations = count;
          },
          200,
        ),
        ollama,
        webSearch: { search: async () => [] },
      },
    );
    const result = await service.search({
      userId: "user-1",
      query: "イベント",
      latitude: 35.65,
      longitude: 139.69,
      limit: 10,
      offset: 0,
    });
    assert.equal(routedDestinations, 1);
    assert.deepEqual(result.events, []);
  });

  it("falls back to today's database events when locality lookup fails", async () => {
    const now = new Date();
    const databaseEvent = toEventRow(
      discoveredEvent("evt-db", "DB内イベント", now, 35.66, 139.7),
    );
    const store = {
      listPreferenceMemories: async () => [],
      listActiveEvents: async () => [databaseEvent],
      setEventEmbedding: async () => undefined,
      findSimilarPreferenceMemories: async () => [],
      recordRecommendationLog: async () => undefined,
    } as unknown as EventStore;
    const service = new LocalLlmRecommendationService(
      store,
      {
        ollamaBaseUrl: "http://127.0.0.1:11434",
        ollamaChatModel: "gemma4:e2b",
        ollamaEmbeddingModel: "embeddinggemma:300m-qat-q4_0",
      },
      {
        locationResolver: {
          resolve: async () => {
            throw new Error("DuckDuckGo unavailable");
          },
        },
        routes: routeProvider(),
        ollama: new OllamaClient(
          "http://127.0.0.1:11434",
          "gemma4:e2b",
          "embeddinggemma:300m-qat-q4_0",
          ollamaFetchStub(),
        ),
      },
    );
    const result = await service.search({
      userId: "user-1",
      query: "イベント",
      latitude: 35.65,
      longitude: 139.69,
      limit: 10,
      offset: 0,
    });
    assert.equal(result.meta.source, "database_fallback");
    assert.ok(
      result.meta.degradedReasons.includes(
        "current_location_resolution_unavailable",
      ),
    );
    assert.equal(result.events[0]?.id, "evt-db");
  });

  it("uses the nearby transit station when coordinate search cannot resolve a locality", async () => {
    let localityResolverCalls = 0;
    let nearbyLookupCoordinates:
      { latitude: number; longitude: number } | undefined;
    let emptyCacheRevalidated = false;
    let searchedQuery = "";
    const store = {
      listPreferenceMemories: async () => [],
      getDiscoveryCache: async () => ({
        payload: [],
        expiresAt: new Date(Date.now() + 60_000),
      }),
      setDiscoveryCache: async ({ expiresAt }: { expiresAt: Date }) => {
        emptyCacheRevalidated = expiresAt.getTime() <= Date.now();
      },
      upsertDiscoveredEvents: async (events: DiscoveredEventInput[]) =>
        events.map(toEventRow),
      listActiveEvents: async () => [],
      setEventEmbedding: async () => undefined,
      findSimilarPreferenceMemories: async () => [],
      recordRecommendationLog: async () => undefined,
    } as unknown as EventStore;
    const service = new LocalLlmRecommendationService(
      store,
      {
        ollamaBaseUrl: "http://127.0.0.1:11434",
        ollamaChatModel: "gemma4:e2b",
        ollamaEmbeddingModel: "embeddinggemma:300m-qat-q4_0",
      },
      {
        locationResolver: {
          resolve: async () => {
            localityResolverCalls += 1;
            throw new Error("DuckDuckGo returned no location search results");
          },
        },
        routes: {
          ...routeProvider(),
          resolveNearbyAreas: async (destinations) => {
            nearbyLookupCoordinates = destinations[0];
            return destinations.map(() => "渋谷駅周辺");
          },
        },
        ollama: new OllamaClient(
          "http://127.0.0.1:11434",
          "gemma4:e2b",
          "embeddinggemma:300m-qat-q4_0",
          ollamaFetchStub(),
        ),
        webSearch: {
          search: async (query) => {
            searchedQuery = query;
            return [];
          },
        },
      },
    );

    const result = await service.search({
      userId: "user-1",
      query: "イベント",
      latitude: 35.6595,
      longitude: 139.7004,
      limit: 10,
      offset: 0,
    });

    assert.equal(localityResolverCalls, 0);
    assert.deepEqual(nearbyLookupCoordinates, {
      latitude: 35.6595,
      longitude: 139.7004,
    });
    assert.match(searchedQuery, /渋谷駅周辺/u);
    assert.equal(emptyCacheRevalidated, true);
    assert.equal(result.meta.currentLocationProvider, "transit_api");
    assert.ok(
      !result.meta.degradedReasons.includes(
        "current_location_resolution_unavailable",
      ),
    );
  });
});

function discoveredEvent(
  id: string,
  name: string,
  now: Date,
  latitude: number,
  longitude: number,
): DiscoveredEventInput {
  return {
    id,
    name,
    location: "東京都渋谷区",
    imageUri: null,
    description: `${name}の説明`,
    detailedDescription: `${name}の詳細`,
    latitude,
    longitude,
    organizerName: "主催者",
    organizerContactEmail: null,
    sourceProvider: "duckduckgo_html",
    sourceUrl: `https://events.example/${id}`,
    sourceFingerprint: `fingerprint-${id}`,
    startsAt: new Date(now.getTime() - 5 * 60_000),
    endsAt: new Date(now.getTime() + 60 * 60_000),
    contentText: `${name}の本文`,
    tags: [name.includes("音楽") ? "音楽" : "展示"],
    embedding: null,
    embeddingModel: null,
  };
}

function toEventRow(event: DiscoveredEventInput): EventRow {
  return {
    id: event.id,
    name: event.name,
    spotName: event.spotName ?? null,
    date: "2026/08/08",
    time: "10:00-12:00",
    location: event.location,
    distance: "距離計算中",
    imageUri: event.imageUri,
    description: event.description,
    detailedDescription: event.detailedDescription,
    latitude: event.latitude,
    longitude: event.longitude,
    organizerName: event.organizerName,
    organizerContactEmail: event.organizerContactEmail,
    rating: 0,
    reviewCount: 0,
    sourceUrl: event.sourceUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
}

function preferenceMemory(
  reviewId: string,
  eventId: string,
  rating: number,
  embedding: number[],
): PreferenceMemoryRow {
  return {
    reviewId,
    userId: "user-1",
    eventId,
    memoryText: "過去イベントの嗜好メモ",
    preferenceTags: rating >= 4 ? ["音楽"] : ["展示"],
    rating,
    embedding,
    embeddingModel: "embeddinggemma:300m-qat-q4_0",
    embeddingStatus: "ready",
    similarity: 1,
  };
}

function vector(first: number, second: number) {
  return Array.from({ length: 768 }, (_, index) =>
    index === 0 ? first : index === 1 ? second : 0,
  );
}

function routeProvider(
  durationSeconds = 1_800,
  onDestinations?: (count: number) => void,
  destinationWalkSeconds = 0,
  nearbyAreaName?: string,
): RouteProvider {
  return {
    computeRoutes: async (_origin, destinations) => {
      onDestinations?.(destinations.length);
      return destinations.map((_, destinationIndex) => ({
        destinationIndex,
        travelMode: "TRANSIT" as const,
        distanceMeters: 2_000,
        durationSeconds: durationSeconds + destinationWalkSeconds,
        destinationWalkSeconds,
        nearbyAreaName,
        fare: null,
      }));
    },
  };
}

function ollamaFetchStub() {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/embed")) {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      return Response.json({
        embeddings: body.input.map((text) =>
          text.includes("音楽フェス")
            ? vector(1, 0)
            : text.includes("苦手な展示")
              ? vector(0, 1)
              : vector(1, 1),
        ),
      });
    }
    return Response.json({
      message: {
        role: "assistant",
        content: JSON.stringify({
          reasons: [
            {
              eventId: "evt-a",
              reason: "高評価した音楽の好みに近いイベントです。",
            },
            { eventId: "evt-b", reason: "現在地から移動可能なイベントです。" },
          ],
        }),
      },
    });
  }) as typeof fetch;
}
