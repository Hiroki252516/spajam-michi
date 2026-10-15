import assert from "node:assert/strict";
import { it } from "node:test";

import { OllamaClient } from "./ollama.js";
import {
  generateRecommendationReasons,
  type ReasonCandidate,
} from "./recommendation-reasons.js";
import { isCleanRecommendationReason } from "./llm-output.js";
import { extractEventsFromHtml } from "./event-extractor.js";
import { SearchTimingCollector } from "./search-timing.js";

const enabled = process.env.RUN_LOCAL_LLM_TESTS === "1";

it(
  "uses local Gemma tool calling and 768-dimensional EmbeddingGemma vectors",
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const client = new OllamaClient(
      process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      process.env.OLLAMA_CHAT_MODEL ?? "gemma4:e2b",
      process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma:300m-qat-q4_0",
    );
    const [embedding] = await client.embed(["音楽イベントが好きです"]);
    assert.equal(embedding?.length, 768);
    let toolCalls = 0;
    const timings = new SearchTimingCollector(
      "ollama-integration",
      undefined,
      () => {},
    );
    const results = await client.searchWithTool(
      {
        area: "東京都 渋谷区",
        date: "2026-08-09",
        query: "音楽イベント",
        preferenceKeywords: ["音楽"],
      },
      async () => {
        toolCalls += 1;
        return [
          {
            title: "テストイベント",
            url: "https://events.example/test",
            snippet: "ツール呼び出し確認用",
          },
        ];
      },
      undefined,
      timings,
    );
    assert.ok(toolCalls >= 1 && toolCalls <= 3);
    assert.equal(results[0]?.url, "https://events.example/test");
    assert.ok(timings.snapshot().stages.gemmaAnalysis.operations >= 1);
  },
);

it(
  "generates clean bounded reasons for the runaway reproduction and six candidates",
  { skip: !enabled, timeout: 90000 },
  async () => {
    const client = new OllamaClient(
      process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      process.env.OLLAMA_CHAT_MODEL ?? "gemma4:e2b",
      process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma:300m-qat-q4_0",
    );
    const base: ReasonCandidate = {
      eventId: "diagnostic-event",
      description: "展示を鑑賞するイベント",
      travelMinutes: 20,
      travelMode: "TRANSIT",
      preferenceScore: 0.8,
    };
    for (const candidates of [
      [base],
      [base],
      [base],
      Array.from({ length: 6 }, (_, i) => ({
        ...base,
        eventId: `diagnostic-event-${i}`,
        travelMinutes: 10 + i * 5,
      })),
    ]) {
      const failures: unknown[] = [];
      const start = performance.now();
      const reasons = await generateRecommendationReasons({
        ollama: client,
        candidates,
        preferenceKeywords: ["展示"],
        onFailure: (error) => failures.push(error),
      });
      assert.deepEqual(failures, []);
      assert.equal(reasons.size, candidates.length);
      assert.ok([...reasons.values()].every(isCleanRecommendationReason));
      assert.ok(performance.now() - start < 16000);
    }
  },
);

it(
  "extracts a source-backed event with bounded real Gemma JSON output",
  { skip: !enabled, timeout: 30000 },
  async () => {
    const client = new OllamaClient(
      process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      process.env.OLLAMA_CHAT_MODEL ?? "gemma4:e2b",
      process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma:300m-qat-q4_0",
    );
    const events = await extractEventsFromHtml({
      sourceUrl: "https://example.com/diagnostic-event",
      html: "<body><h1>接続確認用の展示</h1><p>2026年10月14日開催。会場：接続確認用の横浜会場。住所：神奈川県横浜市中区山下町193番地。</p><p>開催時間：12:00〜15:30</p></body>",
      ollama: client,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.name, "接続確認用の展示");
    assert.equal(events[0]?.address, "神奈川県横浜市中区山下町193番地");
    assert.equal(events[0]?.hoursText, "12:00〜15:30");
  },
);
