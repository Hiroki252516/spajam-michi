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

it("distinguishes legitimate empty results from blocked and malformed pages", async () => {
  let calls = 0;
  const empty = new DuckDuckGoHtmlSearchProvider(
    (async () => {
      calls += 1;
      return new Response('<div class="no-results">No results found</div>');
    }) as typeof fetch,
    async () => {},
  );
  assert.deepEqual(await empty.search("横浜 イベント", 8), []);
  assert.equal(calls, 1);
  for (const html of [
    '<form id="challenge-form">Please complete the following challenge</form>',
    "<html><body>Unexpected content</body></html>",
  ]) {
    calls = 0;
    const issues: string[] = [];
    const provider = new DuckDuckGoHtmlSearchProvider(
      (async () => {
        calls += 1;
        return new Response(html);
      }) as typeof fetch,
      async () => {},
    );
    await assert.rejects(
      provider.search("横浜 イベント", 8, undefined, (reason) =>
        issues.push(reason),
      ),
    );
    assert.equal(calls, 2);
    assert.equal(issues.length, 2);
  }
});

it("retries once and recovers a parseable result", async () => {
  let calls = 0;
  const provider = new DuckDuckGoHtmlSearchProvider(
    (async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 503 })
        : new Response(
            '<div class="result"><a class="result__a" href="https://events.example/1">展示</a></div>',
          );
    }) as typeof fetch,
    async () => {},
  );
  assert.equal((await provider.search("横浜 イベント", 8)).length, 1);
  assert.equal(calls, 2);
});
