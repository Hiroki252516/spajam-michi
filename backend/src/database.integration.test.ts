import assert from "node:assert/strict";
import { it } from "node:test";

import { openDatabase, type DiscoveredEventInput } from "./database.js";
import { SearchTimingCollector } from "./search-timing.js";

const integrationUrl = process.env.DATABASE_INTEGRATION_URL;

it(
  "initializes pgvector and performs vector-backed persistence",
  { skip: !integrationUrl },
  async () => {
    const store = await openDatabase(integrationUrl!, false);
    try {
      await store.initialize(false);
      const startsAt = new Date("2026-08-08T01:00:00Z");
      const endsAt = new Date("2026-08-08T03:00:00Z");
      const base: Omit<
        DiscoveredEventInput,
        "id" | "name" | "sourceFingerprint"
      > = {
        spotName: null,
        location: "東京都渋谷区",
        imageUri: null,
        description: "統合テストイベント",
        detailedDescription: "pgvector統合テスト",
        latitude: 35.6595,
        longitude: 139.7004,
        organizerName: "テスト主催者",
        organizerContactEmail: null,
        sourceProvider: "duckduckgo_html",
        sourceUrl: "https://events.example/list",
        startsAt,
        endsAt,
        contentText: "音楽イベント",
        tags: ["音楽"],
        embedding: vector(1, 0),
        embeddingModel: "embeddinggemma:300m-qat-q4_0",
      };
      const events = await store.upsertDiscoveredEvents([
        {
          ...base,
          id: "evt-integration-1",
          name: "音楽1",
          sourceFingerprint: "fp-1",
        },
        {
          ...base,
          id: "evt-integration-2",
          name: "音楽2",
          sourceFingerprint: "fp-2",
        },
      ]);
      assert.equal(events.length, 2, "one source page may contain two events");
      await store.updateEventSpotName(events[0]!.id, "渋谷駅周辺");
      const eventWithSpotName = await store.findEvent(events[0]!.id);
      assert.equal(eventWithSpotName?.spotName, "渋谷駅周辺");
      await store.createUser({
        id: "user-integration",
        name: "統合テスト",
        email: "integration@example.com",
        passwordHash: "not-used",
      });
      const review = await store.createReview({
        id: "review-integration",
        eventId: events[0]!.id,
        userId: "user-integration",
        rating: 5,
      });
      assert.ok(review);
      await store.savePreferenceMemory({
        reviewId: review.id,
        userId: review.userId,
        eventId: review.eventId,
        memoryText: "音楽が好き",
        preferenceTags: ["音楽"],
        rating: 5,
        embedding: vector(1, 0),
        embeddingModel: "embeddinggemma:300m-qat-q4_0",
        embeddingStatus: "ready",
      });
      const similar = await store.findSimilarPreferenceMemories(
        review.userId,
        vector(1, 0),
        5,
      );
      assert.equal(similar[0]?.reviewId, review.id);
      assert.ok((similar[0]?.similarity ?? 0) > 0.99);
      await store.setDiscoveryCache({
        cacheKey: "integration-cache",
        query: "音楽",
        area: "東京都 渋谷区",
        payload: [
          {
            ...base,
            id: "evt-cache",
            name: "音楽",
            sourceFingerprint: "fp-cache",
          },
        ],
        expiresAt: new Date(Date.now() + 60_000),
      });
      const cache = await store.getDiscoveryCache("integration-cache");
      assert.ok(cache?.payload[0]?.startsAt instanceof Date);
      const jobId = `search-integration-${Date.now()}`;
      await store.createEventSearchJob({
        id: jobId,
        userId: "user-integration",
        query: "音楽",
        limit: 10,
        offset: 0,
        debugRequested: true,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await store.markEventSearchJobRunning(jobId, "user-integration");
      const debugTimings = new SearchTimingCollector(
        jobId,
        undefined,
        () => {},
      ).snapshot();
      await store.completeEventSearchJob(
        jobId,
        "user-integration",
        { events: [] },
        debugTimings,
      );
      const job = await store.findEventSearchJob(jobId, "user-integration");
      assert.equal(job?.status, "succeeded");
      assert.equal(job?.debugRequested, true);
      assert.deepEqual(job?.debugTimings, debugTimings);
      assert.deepEqual(job?.result, { events: [] });
    } finally {
      await store.close();
    }
  },
);

function vector(first: number, second: number) {
  return Array.from({ length: 768 }, (_, index) =>
    index === 0 ? first : index === 1 ? second : 0,
  );
}

it(
  "keeps legacy reviews while selecting fresh verified venues by distance without duplicates",
  { skip: !integrationUrl },
  async () => {
    const store = await openDatabase(integrationUrl!, false);
    const now = new Date();
    const legacy: DiscoveredEventInput = {
      id: "issue9-legacy",
      name: "履歴のイベント",
      location: "神奈川県横浜市中区",
      imageUri: null,
      description: "説明",
      detailedDescription: "詳細",
      latitude: 35.4437,
      longitude: 139.638,
      organizerName: "主催者",
      organizerContactEmail: null,
      sourceProvider: "duckduckgo_html",
      sourceUrl: "https://events.example/legacy",
      sourceFingerprint: "issue9-legacy-fp",
      startsAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() + 5 * 3600000),
      contentText: "イベント本文",
      tags: [],
      embedding: null,
      embeddingModel: null,
    };
    try {
      await store.upsertDiscoveredEvents([legacy]);
      await store.createUser({
        id: "issue9-review-user",
        name: "テスト",
        email: "issue9@example.com",
        passwordHash: "unused",
      });
      const review = await store.createReview({
        id: "issue9-review",
        eventId: legacy.id,
        userId: "issue9-review-user",
        rating: 5,
      });
      assert.ok(review);
      await store.initialize(false);
      assert.equal((await store.findEvent(legacy.id))?.reviewCount, 1);
      const checked = new Date(now.getTime() - 90 * 60000);
      const fresh = {
        ...legacy,
        id: "issue9-fresh",
        name: "確認済み",
        sourceFingerprint: "issue9-fresh-fp",
        location: "神奈川県横浜市中区山下町193番地",
        venueName: "会場",
        venueVerified: true,
        venueVerifiedAt: checked,
        coordinateSource: "source_page" as const,
        coordinateSourceUrl: "https://events.example/map",
        timePrecision: "date_only" as const,
      };
      const far = {
        ...fresh,
        id: "issue9-far",
        name: "遠い候補",
        sourceFingerprint: "issue9-far-fp",
        latitude: 35.6812,
        longitude: 139.7671,
      };
      const stale = {
        ...fresh,
        id: "issue9-stale",
        name: "古い確認",
        sourceFingerprint: "issue9-stale-fp",
        venueVerifiedAt: new Date(now.getTime() - 25 * 3600000),
      };
      await store.upsertDiscoveredEvents([
        far,
        fresh,
        stale,
        {
          ...fresh,
          id: "issue9-zcopy",
          name: "確認 済み",
          location: "神奈川県横浜市中区山下町１９３番地",
          sourceFingerprint: "issue9-copy-fp",
          sourceUrl: "https://events.example/other",
        },
      ]);
      await store.upsertDiscoveredEvents([fresh]); // A cache read must not renew the verification timestamp.
      assert.equal(
        (await store.findEvent(fresh.id))?.venueVerifiedAt?.toISOString(),
        checked.toISOString(),
      );
      assert.equal((await store.findEvent(fresh.id))?.time, "時間未確認");
      const selected = await store.listActiveEvents({
        query: "",
        startsBefore: new Date(now.getTime() + 86400000),
        endsAfter: now,
        origin: { latitude: 35.4437, longitude: 139.638 },
        limit: 2,
      });
      assert.equal(selected.length, 2);
      assert.equal(selected[0]?.name, "確認済み");
      assert.equal(selected[1]?.name, "遠い候補");
      assert.equal((await store.findEvent(legacy.id))?.reviewCount, 1);
      await store.setDiscoveryCache({
        cacheKey: "issue9-quality-cache",
        query: "イベント",
        area: "神奈川県横浜市中区",
        payload: [fresh],
        expiresAt: new Date(now.getTime() + 60000),
      });
      assert.equal(
        (
          await store.getDiscoveryCache("issue9-quality-cache")
        )?.payload[0]?.venueVerifiedAt?.toISOString(),
        checked.toISOString(),
      );
    } finally {
      await store.close();
    }
  },
);
