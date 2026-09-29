import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OllamaClient } from "./ollama.js";

describe("Ollama client", () => {
  it("times out a stalled model request without aborting the search", async () => {
    let requestSignal: AbortSignal | undefined;
    const fakeFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        );
      });
    }) as typeof fetch;
    const searchController = new AbortController();
    const ollama = new OllamaClient(
      "http://127.0.0.1:11434",
      "gemma4:e2b",
      "embeddinggemma:300m-qat-q4_0",
      fakeFetch,
      5,
    );

    await assert.rejects(
      ollama.embed(["イベント検索"], searchController.signal),
    );
    assert.equal(requestSignal?.aborted, true);
    assert.equal(searchController.signal.aborted, false);
  });
});
