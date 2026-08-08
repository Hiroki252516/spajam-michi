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

  it("rejects JSON-LD that has no source-backed address", async () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","name":"座標なしイベント",
       "startDate":"2026-08-08T18:00:00+09:00",
       "endDate":"2026-08-08T20:00:00+09:00",
       "location":{"name":"渋谷会場"}}
    </script>`;
    assert.deepEqual(
      await extractEventsFromHtml({
        sourceUrl: "https://example.com/no-coordinates",
        html,
      }),
      [],
    );
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
});
