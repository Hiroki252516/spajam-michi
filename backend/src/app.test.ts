import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { Hono } from "hono";

import { createApp } from "./app.js";
import type {
  AuthSessionRow,
  EventRow,
  EventStore,
  UserRow,
} from "./database.js";

const JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters";

const events: EventRow[] = [
  {
    id: "1",
    name: "SPAJAM 2026 オープニングセレモニー",
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
  },
  {
    id: "2",
    name: "React Native ワークショップ",
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
  },
];

describe("frontend API", () => {
  let app: Hono;
  let store: EventStore;
  let reviewCreated: boolean;
  let resetCount: number;
  let users: Map<string, UserRow>;
  let sessions: Map<string, AuthSessionRow>;

  beforeEach(() => {
    reviewCreated = false;
    resetCount = 0;
    users = new Map();
    sessions = new Map();
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
      close: async () => undefined,
    };
    app = createApp(store, {
      jwtSecret: JWT_SECRET,
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
    const response = await app.request(
      "/api/events/search?q=React%20Native&limit=10&offset=0",
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      status: string;
      data: { events: { id: string; name: string }[]; total: number };
    };
    assert.equal(body.status, "success");
    assert.equal(body.data.total, 1);
    assert.deepEqual(body.data.events[0], {
      id: "2",
      name: "React Native ワークショップ",
      date: "2026/08/08",
      time: "10:00-11:30",
      location: "東京都渋谷区（ワークショップ会場A）",
      distance: "2.1 km",
      imageUri: "https://example.com/images/event-2.jpg",
      rating: 0,
      description: "React Nativeを使ったモバイル開発の基礎を学べます。",
      coordinates: { latitude: 35.6612, longitude: 139.7017 },
    });
  });

  it("rejects an empty search query", async () => {
    const response = await app.request("/api/events/search?q=");
    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      status: string;
      error: { code: string };
    };
    assert.equal(body.status, "error");
    assert.equal(body.error.code, "INVALID_QUERY");
  });

  it("returns event details", async () => {
    const response = await app.request("/api/events/1");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: { id: string; reviewCount: number; tags: string[] };
    };
    assert.equal(body.data.id, "1");
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
    const productionApp = createApp(store, { jwtSecret: JWT_SECRET });
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
});
