import assert from "node:assert/strict";
import { it } from "node:test";

import { OllamaClient } from "./ollama.js";
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
