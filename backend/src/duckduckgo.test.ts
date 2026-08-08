import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DuckDuckGoHtmlSearchProvider,
  sanitizeSearchTerms,
} from "./duckduckgo.js";

describe("DuckDuckGo HTML adapter", () => {
  it("removes common personal data before external search", () => {
    const sanitized = sanitizeSearchTerms(
      "音楽 user@example.com 090-1234-5678 https://private.example 35.12345,139.12345",
    );
    assert.equal(sanitized, "音楽");
  });

  it("extracts and deduplicates public result URLs", async () => {
    const html = `<div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fevents.example%2F1">イベント</a>
      <div class="result__snippet">説明</div></div>`;
    const provider = new DuckDuckGoHtmlSearchProvider(
      (async () => new Response(html, { status: 200 })) as typeof fetch,
    );
    const results = await provider.search("渋谷 イベント", 8);
    assert.deepEqual(results, [
      {
        title: "イベント",
        url: "https://events.example/1",
        snippet: "説明",
      },
    ]);
  });
});
