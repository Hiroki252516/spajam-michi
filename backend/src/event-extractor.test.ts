import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractEventsFromHtml } from "./event-extractor.js";
import { OllamaClient } from "./ollama.js";

describe("event extraction", () => {
  it("accepts an Event only when dates and a venue address are explicit", async () => {
    const html = `<!doctype html><html><body><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event",
       "name":"渋谷テックミートアップ",
       "startDate":"2026-08-08T18:00:00+09:00",
       "endDate":"2026-08-08T20:00:00+09:00",
       "description":"モバイル開発者向けイベント",
       "location":{"@type":"Place","name":"渋谷会場",
         "address":{"@type":"PostalAddress","addressRegion":"東京都","addressLocality":"渋谷区","streetAddress":"神南1-1-1"}}}
    </script><p>イベント本文</p></body></html>`;
    const events = await extractEventsFromHtml({
      sourceUrl: "https://example.com/event",
      html,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.name, "渋谷テックミートアップ");
    assert.equal(events[0]?.address, "東京都渋谷区神南1-1-1");
  });

  it("accepts a source-backed venue name when no street address is provided", async () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","name":"座標なしイベント",
       "startDate":"2026-08-08T18:00:00+09:00",
       "endDate":"2026-08-08T20:00:00+09:00",
       "location":{"name":"渋谷会場"}}
    </script>`;
    const events = await extractEventsFromHtml({
      sourceUrl: "https://example.com/no-coordinates",
      html,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.location, "渋谷会場");
    assert.equal(events[0]?.address, "渋谷会場");
  });

  it("keeps a date-only event as an all-day result without inventing times", async () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","name":"日付だけの展示会",
       "startDate":"2026-08-08","endDate":"2026-08-08",
       "location":{"name":"渋谷会場"}}
    </script>`;
    const events = await extractEventsFromHtml({
      sourceUrl: "https://example.com/all-day",
      html,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.startsAt.toISOString(), "2026-08-07T15:00:00.000Z");
    assert.equal(events[0]?.endsAt.toISOString(), "2026-08-08T14:59:59.999Z");
  });

  it("rejects an address invented by the local model", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: JSON.stringify({
              events: [
                {
                  name: "推測イベント",
                  startDate: "2026-08-08T18:00:00+09:00",
                  endDate: "2026-08-08T20:00:00+09:00",
                  location: "渋谷",
                  address: "東京都渋谷区神南1-1-1",
                  description: "説明",
                  imageUrl: "",
                  organizerName: "主催者",
                  organizerContactEmail: "",
                  tags: [],
                },
              ],
            }),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const ollama = new OllamaClient(
      "http://127.0.0.1:11434",
      "gemma4:e2b",
      "embeddinggemma:300m-qat-q4_0",
      fakeFetch,
    );
    const events = await extractEventsFromHtml({
      sourceUrl: "https://example.com/invented",
      html: "<html><body>渋谷でイベントを開催します。</body></html>",
      ollama,
    });
    assert.deepEqual(events, []);
  });

  it("accepts a verified venue name when the model has no street address", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: JSON.stringify({
              events: [
                {
                  name: "駅前マルシェ",
                  startDate: "2026-08-08T10:00:00+09:00",
                  endDate: "2026-08-08T16:00:00+09:00",
                  location: "渋谷駅前広場",
                  address: "",
                  description: "地域のマルシェ",
                  imageUrl: "",
                  organizerName: "主催者",
                  organizerContactEmail: "",
                  tags: [],
                },
              ],
            }),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const ollama = new OllamaClient(
      "http://127.0.0.1:11434",
      "gemma4:e2b",
      "embeddinggemma:300m-qat-q4_0",
      fakeFetch,
    );
    const events = await extractEventsFromHtml({
      sourceUrl: "https://example.com/marche",
      html: "<html><body>駅前マルシェは2026年8月8日に渋谷駅前広場で開催します。</body></html>",
      ollama,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.location, "渋谷駅前広場");
    assert.equal(events[0]?.address, "渋谷駅前広場");
  });
});
