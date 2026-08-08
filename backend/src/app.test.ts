import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { Hono } from "hono";

import { createApp } from "./app.js";
import type {
  AuthSessionRow,
  EventRow,
  EventSearchJobRow,
  EventStore,
  UserRow,
} from "./database.js";
import type { EventRecommendationService } from "./recommendation.js";
import { RoutingUnavailableError } from "./recommendation.js";

const JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters";

const events: EventRow[] = [
  {
    id: "1",
    name: "SPAJAM 2026 オープニングセレモニー",
    spotName: "渋谷駅周辺",
    date: "2026/08/08",
    time: "09:00-09:30",
    location: "東京都渋谷区",
    distance: "1.2 km",
    imageUri: "https://example.com/images/event-1.jpg",
    rating: 0,
    reviewCount: 0,
    description: "SPAJAMのオープニングセレモニーです。全参加者が集まります。",
    detailedDescription: "ハッカソンの進行説明を行います。",
    latitude: 35.6595,
    longitude: 139.7004,
    organizerName: "SPAJAM運営事務局",
    organizerContactEmail: "info@example.com",
    sourceUrl: "https://example.com/events/1",
    startsAt: new Date("2026-08-08T00:00:00Z"),
    endsAt: new Date("2026-08-08T00:30:00Z"),
  },
  {
    id: "2",
    name: "React Native ワークショップ",
    spotName: "表参道駅周辺",
    date: "2026/08/08",
    time: "10:00-11:30",
    location: "東京都渋谷区（ワークショップ会場A）",
    distance: "2.1 km",
    imageUri: "https://example.com/images/event-2.jpg",
    rating: 0,
    reviewCount: 0,
    description: "React Nativeを使ったモバイル開発の基礎を学べます。",
    detailedDescription: "React NativeとExpoを使って開発します。",
    latitude: 35.6612,
    longitude: 139.7017,
    organizerName: "SPAJAM運営事務局",
    organizerContactEmail: "info@example.com",
    sourceUrl: "https://example.com/events/2",
    startsAt: new Date("2026-08-08T01:00:00Z"),
    endsAt: new Date("2026-08-08T02:30:00Z"),
  },
];

describe("frontend API", () => {
  let app: Hono;
  let store: EventStore;
  let reviewCreated: boolean;
  let resetCount: number;
  let users: Map<string, UserRow>;
  let sessions: Map<string, AuthSessionRow>;
  let searchJobs: Map<string, EventSearchJobRow>;
  let recommendationService: EventRecommendationService;
  let recommendationSearchCount: number;

  beforeEach(() => {
    reviewCreated = false;
    resetCount = 0;
    users = new Map();
    sessions = new Map();
    searchJobs = new Map();
    recommendationSearchCount = 0;
    store = {
      health: async () => "PostgreSQL test",
      searchEvents: async ({ query, limit, offset }) => {
        const matches = events.filter(
          (event) =>
            event.name.includes(query) ||
            event.location.includes(query) ||
            event.description.includes(query),
        );
        return {
          events: matches.slice(offset, offset + limit),
          total: matches.length,
        };
      },
      findEvent: async (eventId) => {
        const event = events.find(({ id }) => id === eventId);
        return event
          ? { ...event, tags: ["ハッカソン", "全参加者向け", "開幕"] }
          : null;
      },
      eventExists: async (eventId) => events.some(({ id }) => id === eventId),
      createReview: async (input) => {
        if (reviewCreated) return null;
        reviewCreated = true;
        const now = new Date("2026-08-08T14:30:00Z");
        return {
          ...input,
          comment: input.comment ?? null,
          createdAt: now,
          updatedAt: now,
        };
      },
      resetDevelopmentData: async () => {
        resetCount += 1;
      },
      createUser: async (input) => {
        if (
          [...users.values()].some(
            ({ email }) => email.toLowerCase() === input.email.toLowerCase(),
          )
        ) {
          return null;
        }
        const user = { ...input, avatarUrl: null };
        users.set(user.id, user);
        return user;
      },
      findUserByEmail: async (email) =>
        [...users.values()].find(
          (user) => user.email.toLowerCase() === email.toLowerCase(),
        ) ?? null,
      findUserById: async (userId) => users.get(userId) ?? null,
      createAuthSession: async (input) => {
        sessions.set(input.id, { ...input, revokedAt: null });
      },
      findAuthSession: async (sessionId) => sessions.get(sessionId) ?? null,
      revokeAuthSession: async (sessionId) => {
        const session = sessions.get(sessionId);
        if (session) session.revokedAt = new Date();
      },
      listVisitedEvents: async () => [],
      upsertDiscoveredEvents: async () => [],
      listActiveEvents: async () => [],
      setEventEmbedding: async () => undefined,
      savePreferenceMemory: async () => undefined,
      listPreferenceMemories: async () => [],
      findSimilarPreferenceMemories: async () => [],
      getDiscoveryCache: async () => null,
      setDiscoveryCache: async () => undefined,
      recordRecommendationLog: async () => undefined,
      createEventSearchJob: async (input) => {
        const now = new Date();
        const job: EventSearchJobRow = {
          ...input,
          status: "queued",
          result: null,
          debugTimings: null,
          errorCode: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        };
        searchJobs.set(job.id, job);
        return job;
      },
      markEventSearchJobRunning: async (jobId, userId) => {
        const job = searchJobs.get(jobId);
        if (job?.userId === userId) job.status = "running";
      },
      completeEventSearchJob: async (jobId, userId, result, debugTimings) => {
        const job = searchJobs.get(jobId);
        if (job?.userId === userId) {
          job.status = "succeeded";
          job.result = result;
          job.debugTimings = debugTimings;
        }
      },
      failEventSearchJob: async (
        jobId,
        userId,
        errorCode,
        errorMessage,
        debugTimings,
      ) => {
        const job = searchJobs.get(jobId);
        if (job?.userId === userId) {
          job.status = "failed";
          job.errorCode = errorCode;
          job.errorMessage = errorMessage;
          job.debugTimings = debugTimings;
        }
      },
      findEventSearchJob: async (jobId, userId) => {
        const job = searchJobs.get(jobId);
        return job?.userId === userId ? job : null;
      },
      close: async () => undefined,
    };
    recommendationService = {
      search: async ({ query, limit, offset }) => {
        recommendationSearchCount += 1;
        const matches = events.filter(
          (event) =>
            query === "イベント" ||
            event.name.includes(query) ||
            event.location.includes(query) ||
            event.description.includes(query),
        );
        return {
          events: matches.slice(offset, offset + limit).map((event) => ({
            ...event,
            spotName: event.spotName ?? "周辺エリア情報なし",
            duration: "約25分",
            cost: "0円",
            travelMode: "WALK" as const,
            travelDurationMinutes: 25,
            recommendationReason: "徒歩圏内で関心に近いイベントです。",
          })),
          total: matches.length,
          meta: {
            personalized: false,
            source: "live" as const,
            generatedAt: "2026-08-08T00:00:00.000Z",
            routingProvider: "transit_api" as const,
            geocodingProvider: "gsi" as const,
            currentLocationProvider: "duckduckgo" as const,
            degradedReasons: [],
            travelAdvisory: "Transit APIによる所要時間です。",
          },
        };
      },
      indexReview: async () => undefined,
    };
    app = createApp(store, {
      jwtSecret: JWT_SECRET,
      recommendationService,
      enableDevelopmentEndpoints: true,
    });
  });

  it("returns PostgreSQL health information", async () => {
    const response = await app.request("/health");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      status: string;
      version: string;
      database: string;
    };
    assert.equal(body.status, "ok");
    assert.equal(body.version, "1.0.0");
    assert.equal(body.database, "postgresql");
  });

  it("searches events with pagination", async () => {
    const token = await registerAndGetToken();
    const response = await app.request(
      "/api/events/search?q=React%20Native&latitude=35.6595&longitude=139.7004&limit=10&offset=0",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 202);
    const accepted = (await response.json()) as {
      data: { jobId: string; status: string };
    };
    assert.equal(accepted.data.status, "queued");
    const result = await pollSearchJob(token, accepted.data.jobId);
    const body = result as {
      status: string;
      data: {
        status: string;
        events: { id: string; spotName: string }[];
        total: number;
        meta: Record<string, unknown>;
      };
    };
    assert.equal(body.status, "success");
    assert.equal(body.data.status, "succeeded");
    assert.equal(body.data.total, 1);
    assert.equal("debugTimings" in body.data.meta, false);
    assert.deepEqual(body.data.events[0], {
      id: "2",
      spotName: "表参道駅周辺",
      date: "2026/08/08",
      time: "10:00-11:30",
      location: "東京都渋谷区（ワークショップ会場A）",
      distance: "2.1 km",
      imageUri: "https://example.com/images/event-2.jpg",
      rating: 0,
      description: "React Nativeを使ったモバイル開発の基礎を学べます。",
      coordinates: { latitude: 35.6612, longitude: 139.7017 },
      sourceUrl: "https://example.com/events/2",
      duration: "約25分",
      cost: "0円",
      travelMode: "WALK",
      travelDurationMinutes: 25,
      recommendationReason: "徒歩圏内で関心に近いイベントです。",
    });
  });

  it("requires authentication before calling recommendation dependencies", async () => {
    const response = await app.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004&debug=timings",
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as {
      status: string;
      error: { code: string };
    };
    assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
    assert.equal(recommendationSearchCount, 0);
  });

  it("rejects invalid and expired search sessions before dependencies", async () => {
    const invalid = await app.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004",
      { headers: { Authorization: "Bearer invalid-token" } },
    );
    assert.equal(invalid.status, 401);
    assert.equal(recommendationSearchCount, 0);

    const token = await registerAndGetToken();
    const session = sessions.values().next().value as
      AuthSessionRow | undefined;
    assert.ok(session);
    session.expiresAt = new Date(0);
    const expired = await app.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(expired.status, 401);
    const body = (await expired.json()) as { error: { code: string } };
    assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
    assert.equal(recommendationSearchCount, 0);
  });

  it("requires valid coordinates after authentication", async () => {
    const token = await registerAndGetToken();
    const response = await app.request("/api/events/search", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      status: string;
      error: { code: string };
    };
    assert.equal(body.status, "error");
    assert.equal(body.error.code, "LOCATION_REQUIRED");
    assert.equal(recommendationSearchCount, 0);
  });

  it("rejects disabled and invalid timing debug requests before creating a job", async () => {
    const token = await registerAndGetToken();
    const disabled = await app.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004&debug=timings",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(disabled.status, 403);
    assert.equal(
      ((await disabled.json()) as { error: { code: string } }).error.code,
      "DEBUG_TIMINGS_DISABLED",
    );

    const debugApp = createApp(store, {
      jwtSecret: JWT_SECRET,
      recommendationService,
      enableSearchTimingDebug: true,
    });
    const invalid = await debugApp.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004&debug=verbose",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(invalid.status, 400);
    assert.equal(
      ((await invalid.json()) as { error: { code: string } }).error.code,
      "INVALID_DEBUG_MODE",
    );
    assert.equal(searchJobs.size, 0);
    assert.equal(recommendationSearchCount, 0);
  });

  it("returns all six timing stages only for an enabled debug search", async () => {
    const token = await registerAndGetToken();
    const debugApp = createApp(store, {
      jwtSecret: JWT_SECRET,
      recommendationService,
      enableSearchTimingDebug: true,
    });
    const response = await debugApp.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004&debug=timings",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 202);
    const accepted = (await response.json()) as { data: { jobId: string } };
    const body = (await pollSearchJob(
      token,
      accepted.data.jobId,
      debugApp,
    )) as {
      data: {
        meta: {
          debugTimings: {
            version: number;
            unit: string;
            totalMs: number;
            stages: Record<string, { status: string }>;
          };
        };
      };
    };
    const timings = body.data.meta.debugTimings;
    assert.equal(timings.version, 1);
    assert.equal(timings.unit, "ms");
    assert.ok(timings.totalMs >= 0);
    assert.deepEqual(Object.keys(timings.stages).sort(), [
      "duckDuckGoSearch",
      "eventPageFetch",
      "gemmaAnalysis",
      "gsiGeocoding",
      "ragRecommendation",
      "transitRouting",
    ]);
  });

  it("returns partial timing data when a debug search fails", async () => {
    const token = await registerAndGetToken();
    recommendationService.search = async () => {
      throw new RoutingUnavailableError("Transit API unavailable");
    };
    const debugApp = createApp(store, {
      jwtSecret: JWT_SECRET,
      recommendationService,
      enableSearchTimingDebug: true,
    });
    const response = await debugApp.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004&debug=timings",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const accepted = (await response.json()) as { data: { jobId: string } };
    const body = (await pollSearchJob(
      token,
      accepted.data.jobId,
      debugApp,
    )) as {
      data: {
        status: string;
        error: { code: string };
        debugTimings: { stages: Record<string, unknown> };
      };
    };
    assert.equal(body.data.status, "failed");
    assert.equal(body.data.error.code, "ROUTING_UNAVAILABLE");
    assert.equal(Object.keys(body.data.debugTimings.stages).length, 6);
  });

  it("records a stable failure when route calculation is unavailable", async () => {
    const token = await registerAndGetToken();
    recommendationService.search = async () => {
      throw new RoutingUnavailableError("Transit API unavailable");
    };
    const response = await app.request(
      "/api/events/search?latitude=35.6595&longitude=139.7004",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 202);
    const accepted = (await response.json()) as { data: { jobId: string } };
    const body = (await pollSearchJob(token, accepted.data.jobId)) as {
      data: { status: string; error: { code: string } };
    };
    assert.equal(body.data.status, "failed");
    assert.equal(body.data.error.code, "ROUTING_UNAVAILABLE");
  });

  it("returns event details", async () => {
    const response = await app.request("/api/events/1");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: {
        id: string;
        spotName: string;
        reviewCount: number;
        tags: string[];
        name?: string;
      };
    };
    assert.equal(body.data.id, "1");
    assert.equal(body.data.spotName, "渋谷駅周辺");
    assert.equal("name" in body.data, false);
    assert.equal(body.data.reviewCount, 0);
    assert.deepEqual(body.data.tags, ["ハッカソン", "全参加者向け", "開幕"]);
  });

  it("creates a review and rejects a duplicate", async () => {
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "1",
        rating: 5,
        comment: "素晴らしいイベントでした！",
        userId: "user-123",
      }),
    };
    const created = await app.request("/api/reviews", request);
    assert.equal(created.status, 201);

    const duplicate = await app.request("/api/reviews", request);
    assert.equal(duplicate.status, 409);
    const body = (await duplicate.json()) as { error: { code: string } };
    assert.equal(body.error.code, "DUPLICATE_REVIEW");
  });

  it("rejects an invalid rating", async () => {
    const response = await app.request("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "1", rating: 6, userId: "user-123" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "INVALID_RATING");
  });

  it("resets dummy data through the development endpoint", async () => {
    const response = await app.request("/api/dev/reset", { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal(resetCount, 1);
    assert.deepEqual(await response.json(), {
      status: "success",
      data: { reset: true },
    });
  });

  it("does not expose the reset endpoint outside development", async () => {
    const productionApp = createApp(store, {
      jwtSecret: JWT_SECRET,
      recommendationService,
    });
    const response = await productionApp.request("/api/dev/reset", {
      method: "POST",
    });
    assert.equal(response.status, 404);
    assert.equal(resetCount, 0);
  });

  it("registers a user and returns a JWT", async () => {
    const response = await registerUser();
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      status: string;
      data: {
        token: string;
        user: { id: string; name: string; avatarUrl: null; visitedEvents: [] };
      };
    };
    assert.equal(body.status, "success");
    assert.ok(body.data.token.split(".").length === 3);
    assert.equal(body.data.user.name, "山田 太郎");
    assert.deepEqual(body.data.user.visitedEvents, []);
  });

  it("exposes only spot names in visited-event history", async () => {
    store.listVisitedEvents = async () => [
      {
        id: "review-1",
        spotName: "渋谷駅周辺",
        visitedDate: "2026年8月8日",
        rating: 5,
      },
    ];
    const response = await registerUser();
    const body = (await response.json()) as {
      data: {
        user: {
          visitedEvents: Array<{
            spotName: string;
            eventName?: string;
          }>;
        };
      };
    };
    assert.equal(body.data.user.visitedEvents[0]?.spotName, "渋谷駅周辺");
    assert.equal("eventName" in body.data.user.visitedEvents[0]!, false);
  });

  it("rejects a duplicate email address", async () => {
    await registerUser();
    const response = await registerUser();
    assert.equal(response.status, 409);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "AUTH_EMAIL_ALREADY_EXISTS");
  });

  it("logs in and returns the current user", async () => {
    await registerUser();
    const loginResponse = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        password: "Password123!",
      }),
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = (await loginResponse.json()) as {
      data: { token: string; user: { name: string } };
    };
    assert.equal(loginBody.data.user.name, "山田 太郎");

    const meResponse = await app.request("/api/auth/me", {
      headers: { Authorization: `Bearer ${loginBody.data.token}` },
    });
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as {
      data: { user: { name: string } };
    };
    assert.equal(meBody.data.user.name, "山田 太郎");
  });

  it("rejects invalid login credentials", async () => {
    await registerUser();
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        password: "wrong-password",
      }),
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "AUTH_INVALID_CREDENTIALS");
  });

  it("invalidates the JWT on logout", async () => {
    const registerResponse = await registerUser();
    const registerBody = (await registerResponse.json()) as {
      data: { token: string };
    };
    const headers = { Authorization: `Bearer ${registerBody.data.token}` };
    const logoutResponse = await app.request("/api/auth/logout", {
      method: "POST",
      headers,
    });
    assert.equal(logoutResponse.status, 200);

    const meResponse = await app.request("/api/auth/me", { headers });
    assert.equal(meResponse.status, 401);
    const body = (await meResponse.json()) as { error: { code: string } };
    assert.equal(body.error.code, "AUTH_UNAUTHORIZED");
  });

  function registerUser() {
    return app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "山田 太郎",
        email: "user@example.com",
        password: "Password123!",
      }),
    });
  }

  async function registerAndGetToken() {
    const response = await registerUser();
    const body = (await response.json()) as { data: { token: string } };
    return body.data.token;
  }

  async function pollSearchJob(
    token: string,
    jobId: string,
    targetApp: Hono = app,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await targetApp.request(
        `/api/events/search/jobs/${jobId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        data: { status: string };
      };
      if (body.data.status === "succeeded" || body.data.status === "failed") {
        return body;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.fail("search job did not finish");
  }
});
