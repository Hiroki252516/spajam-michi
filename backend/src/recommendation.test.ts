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
  type RecommendationConfig,
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
      area: "東京都渋谷区",
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

  it("keeps events and uses a grounded fallback when a generated reason is contaminated", async () => {
    const now = new Date();
    const event = discoveredEvent("evt-a", "検証イベント", now, 35.66, 139.7);
    const normalFetch = ollamaFetchStub();
    const service = testService(
      {
        getDiscoveryCache: async () => ({
          payload: [event],
          expiresAt: new Date(now.getTime() + 60000),
        }),
      },
      {
        ollama: new OllamaClient(
          "http://127.0.0.1:11434",
          "gemma4:e2b",
          "embeddinggemma:300m-qat-q4_0",
          async (url, init) =>
            String(url).endsWith("/api/chat")
              ? Response.json({
                  message: {
                    content: JSON.stringify({
                      reasons: { "evt-a": "展示です。}]}```python```json" },
                    }),
                  },
                })
              : normalFetch(url, init),
        ),
      },
    );
    const result = await service.search(searchInput());
    assert.equal(result.total, 1);
    assert.ok(
      result.meta.degradedReasons.includes("recommendation_reason_unavailable"),
    );
    assert.equal(
      result.events[0]?.recommendationReason,
      "Transit APIの最短旅程で約30分、当日参加できるイベントです。",
    );
    assert.ok(!result.events[0]?.recommendationReason.includes("```"));
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
      area: "東京都渋谷区",
      latitude: 35.65,
      longitude: 139.69,
      limit: 10,
      offset: 0,
    });
    assert.equal(routedDestinations, 1);
    assert.deepEqual(result.events, []);
  });

  it("uses only recently verified database candidates after search failure", async () => {
    const now = new Date();
    const good = toEventRow(
      discoveredEvent("evt-db", "DB内イベント", now, 35.66, 139.7),
    );
    const old = {
      ...good,
      id: "old",
      name: "古い候補",
      venueVerifiedAt: new Date(now.getTime() - 25 * 3600000),
    };
    const unverified = { ...good, id: "unverified", venueVerified: false };
    const store = {
      listPreferenceMemories: async () => [],
      getDiscoveryCache: async () => null,
      setDiscoveryCache: async () => undefined,
      listActiveEvents: async () => [
        unverified,
        old,
        good,
        { ...good, id: "duplicate", sourceUrl: "https://other.example/event" },
      ],
      upsertDiscoveredEvents: async () => [],
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
        routes: routeProvider(),
        webSearch: {
          search: async () => {
            throw new Error("unavailable");
          },
        },
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
      area: "東京都渋谷区",
      latitude: 35.65,
      longitude: 139.69,
      limit: 20,
      offset: 0,
    });
    assert.equal(result.meta.source, "database_fallback");
    assert.ok(result.meta.degradedReasons.includes("event_search_unavailable"));
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.id, "evt-db");
    assert.ok(!result.events[0]?.spotName.includes("役所"));
  });

  it("searches the supplied municipality without sending GPS coordinates", async () => {
    const queries: string[] = [];
    let emptyCacheRevalidated = false;
    const store = {
      listPreferenceMemories: async () => [],
      getDiscoveryCache: async () => ({ payload: [], expiresAt: new Date() }),
      setDiscoveryCache: async ({ expiresAt }: { expiresAt: Date }) => {
        emptyCacheRevalidated = expiresAt.getTime() <= Date.now();
      },
      upsertDiscoveredEvents: async () => [],
      listActiveEvents: async () => [],
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
        routes: {
          ...routeProvider(),
          resolveNearbyAreas: async () => {
            throw new Error("Origin locality must not use Transit");
          },
        },
        webSearch: {
          search: async (query) => {
            queries.push(query);
            return [];
          },
        },
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
      area: "東京都渋谷区",
      latitude: 35.6595,
      longitude: 139.7004,
      limit: 10,
      offset: 0,
    });
    assert.ok(queries.length >= 2);
    assert.ok(
      queries.every(
        (query) =>
          query.startsWith("東京都渋谷区") &&
          !query.includes("35.6595") &&
          !query.includes("139.7004"),
      ),
    );
    assert.equal(emptyCacheRevalidated, true);
    assert.equal(result.meta.currentLocationProvider, "device_geocoder");
  });

  it("broadens search before crawling and prioritizes supported event details", async () => {
    const queries: string[] = [];
    const fetched: string[] = [];
    const walker = "https://www.walkerplus.com/event/ar0314e123456/";
    const service = testService(
      {},
      {
        webSearch: {
          search: async (query) => {
            queries.push(query);
            return [
              {
                title: "イベント",
                snippet: "",
                url:
                  queries.length === 1
                    ? "https://city.example/event/1"
                    : walker,
              },
            ];
          },
        },
        pageFetcher: async (url) => {
          assert.equal(queries.length, 2);
          fetched.push(url);
          return { url, html: verifiedEventHtml() };
        },
        venueGeocoder: {
          geocode: async () => {
            throw new Error("Explicit source coordinates must be preferred");
          },
        },
      },
    );
    const result = await service.search(searchInput());
    assert.equal(fetched[0], walker);
    assert.ok(fetched.includes(`${walker}map.html`));
    assert.ok(queries[1]?.includes("今日 開催イベント"));
    assert.equal(result.total, 1);
    assert.equal(result.meta.source, "live");
    assert.equal(result.events[0]?.coordinateSource, "source_page");
  });

  it("retains confirmed candidates when discovery times out and reserves time for routes", async () => {
    let routingWasAvailable = false;
    const service = testService(
      {},
      {
        webSearch: {
          search: async () => [
            {
              title: "展示",
              snippet: "",
              url: "https://www.walkerplus.com/event/ar0314e123456/",
            },
          ],
        },
        pageFetcher: async (url, options) => {
          if (url.endsWith("map.html")) {
            await new Promise((resolve) => setTimeout(resolve, 90));
            options?.signal?.throwIfAborted();
          }
          return { url, html: verifiedEventHtml() };
        },
        routes: {
          computeRoutes: async (_origin, destinations, _departure, signal) => {
            routingWasAvailable = !signal?.aborted;
            return destinations.map((_, destinationIndex) => ({
              destinationIndex,
              travelMode: "WALK",
              durationSeconds: 600,
              distanceMeters: 700,
              fare: null,
            }));
          },
        },
      },
      { searchTimeoutMs: 120 },
    );
    const result = await service.search(searchInput());
    assert.equal(result.total, 1);
    assert.equal(routingWasAvailable, true);
    assert.ok(result.meta.degradedReasons.includes("event_discovery_timeout"));
  });

  it("rejects an administrative area marker or a floor-only venue", async () => {
    for (const venueName of ["横浜市中区周辺", "8階 催会場"]) {
      const service = testService(
        {},
        {
          webSearch: {
            search: async () => [
              {
                title: "展示",
                snippet: "",
                url: "https://events.example/event/1",
              },
            ],
          },
          pageFetcher: async (url) => ({
            url,
            html: verifiedEventHtml()
              .replace("展示会場", venueName)
              .replace("神奈川県横浜市中区山下町193番地", "神奈川県横浜市中区"),
          }),
        },
      );
      const result = await service.search(searchInput());
      assert.equal(result.total, 0);
      assert.ok(
        result.meta.degradedReasons.includes("venue_address_unverified"),
      );
    }
  });

  it("validates freshly confirmed venues against the current time after a slow discovery", async (t) => {
    const now = new Date("2026-10-14T14:00:00+09:00");
    t.mock.timers.enable({ apis: ["Date"], now });
    let advanced = false;
    const service = testService(
      {},
      {
        webSearch: {
          search: async () => [
            {
              title: "展示",
              snippet: "",
              url: "https://events.example/event/1",
            },
          ],
        },
        pageFetcher: async (url) => {
          if (!advanced) {
            t.mock.timers.tick(65000);
            advanced = true;
          }
          return { url, html: verifiedEventHtml() };
        },
      },
    );
    const result = await service.search(searchInput());
    assert.equal(result.total, 1);
    assert.equal(
      result.events[0]?.venueVerifiedAt?.getTime(),
      now.getTime() + 65000,
    );
  });

  it("excludes arrival after today's confirmed closing while keeping unknown schedules explicit", async (t) => {
    const now = new Date("2026-10-14T14:00:00+09:00");
    t.mock.timers.enable({ apis: ["Date"], now });
    const base = {
      ...discoveredEvent("closing", "終了前", now, 35.66, 139.7),
      timePrecision: "date_only" as const,
      startsAt: new Date("2026-10-01T00:00:00+09:00"),
      endsAt: new Date("2026-10-31T23:59:59+09:00"),
    };
    const service = testService({
      getDiscoveryCache: async () => ({
        expiresAt: new Date(now.getTime() + 60000),
        payload: [
          {
            ...base,
            id: "late",
            name: "到着時に終了",
            hoursText: "10:00〜14:20",
          },
          { ...base, id: "open", name: "到着可能", hoursText: "10:00〜14:40" },
          { ...base, id: "unknown", name: "時間未確認", hoursText: null },
        ],
      }),
    });
    const result = await service.search(searchInput());
    assert.deepEqual(
      new Set(result.events.map((event) => event.id)),
      new Set(["open", "unknown"]),
    );
    assert.equal(
      result.events.find((event) => event.id === "unknown")?.hoursText,
      null,
    );
  });

  it("includes discovery elapsed time when checking arrival before closing", async (t) => {
    const now = new Date("2026-10-14T14:00:00+09:00");
    t.mock.timers.enable({ apis: ["Date"], now });
    const event = {
      ...discoveredEvent("last-minute", "閉場間近", now, 35.66, 139.7),
      hoursText: "10:00〜14:20",
    };
    let departedAt: Date | undefined;
    const service = testService(
      {
        getDiscoveryCache: async () => {
          t.mock.timers.tick(75000);
          return {
            payload: [event],
            expiresAt: new Date(now.getTime() + 900000),
          };
        },
      },
      {
        routes: {
          computeRoutes: async (origin, destinations, departure, signal) => {
            departedAt = departure;
            return routeProvider(1170).computeRoutes(
              origin,
              destinations,
              departure,
              signal,
            );
          },
        },
      },
    );
    const result = await service.search(searchInput());
    assert.equal(departedAt?.getTime(), now.getTime() + 75000);
    assert.equal(result.total, 0);
    assert.ok(result.meta.degradedReasons.includes("no_reachable_events"));
  });
});

function searchInput() {
  return {
    userId: "user-1",
    query: "イベント",
    area: "神奈川県横浜市",
    latitude: 35.4658,
    longitude: 139.6223,
    limit: 20,
    offset: 0,
  };
}

function verifiedEventHtml() {
  return `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "出典の展示", startDate: "2026-01-01", endDate: "2099-12-31", location: { name: "展示会場", address: "神奈川県横浜市中区山下町193番地", geo: { latitude: 35.4437, longitude: 139.638 } } })}</script>`;
}

function testService(
  overrides: Partial<EventStore>,
  dependencies: ConstructorParameters<
    typeof LocalLlmRecommendationService
  >[2] = {},
  config: Partial<RecommendationConfig> = {},
) {
  const store = {
    listPreferenceMemories: async () => [],
    getDiscoveryCache: async () => null,
    setDiscoveryCache: async () => {},
    upsertDiscoveredEvents: async (events: DiscoveredEventInput[]) =>
      events.map(toEventRow),
    listActiveEvents: async () => [],
    setEventEmbedding: async () => {},
    findSimilarPreferenceMemories: async () => [],
    recordRecommendationLog: async () => {},
    ...overrides,
  } as EventStore;
  return new LocalLlmRecommendationService(
    store,
    {
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaChatModel: "gemma4:e2b",
      ollamaEmbeddingModel: "embeddinggemma:300m-qat-q4_0",
      ...config,
    },
    {
      routes: routeProvider(),
      webSearch: { search: async () => [] },
      ollama: new OllamaClient(
        "http://127.0.0.1:11434",
        "gemma4:e2b",
        "embeddinggemma:300m-qat-q4_0",
        ollamaFetchStub(),
      ),
      ...dependencies,
    },
  );
}

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
    location: "東京都渋谷区神南1-1-1",
    venueName: "渋谷会場",
    venueVerified: true,
    venueVerifiedAt: now,
    coordinateSource: "gsi_address",
    timePrecision: "datetime",
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
    ...event,
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
    const body = JSON.parse(String(init?.body)) as {
      messages: { role: string; content: string }[];
    };
    const userInput = JSON.parse(
      body.messages.find((message) => message.role === "user")!.content,
    ) as { events?: { eventId: string }[] };
    return Response.json({
      message: {
        role: "assistant",
        content: JSON.stringify({
          reasons: Object.fromEntries(
            (userInput.events ?? []).map((event) => [
              event.eventId,
              event.eventId === "evt-a"
                ? "高評価した音楽の好みに近いイベントです。"
                : "現在地から移動可能なイベントです。",
            ]),
          ),
        }),
      },
    });
  }) as typeof fetch;
}
