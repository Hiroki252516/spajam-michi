import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import {
  OllamaClient,
  OllamaOutputError,
  ollamaFailureReason,
} from "./ollama.js";

describe("Ollama client", () => {
  it("times out a stalled model request without aborting the search", async () => {
    let requestSignal: AbortSignal | undefined;
    const fakeFetch = (async (
      _input: URL | RequestInfo,
      init?: RequestInit,
    ) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        // A real HTTP request keeps the event loop alive; AbortSignal.timeout alone does not.
        const guard = setTimeout(
          () => reject(new Error("Request abort was not delivered")),
          1000,
        );
        requestSignal?.addEventListener(
          "abort",
          () => {
            clearTimeout(guard);
            reject(requestSignal?.reason);
          },
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
      { name: "TimeoutError" },
    );
    assert.equal(requestSignal?.aborted, true);
    assert.equal(searchController.signal.aborted, false);
  });

  it("derives bounded generation schemas from the runtime validator", async () => {
    const requestBodies: string[] = [];
    const client = outputClient({ tags: ["展示"] }, async (_url, init) => {
      requestBodies.push(String(init?.body));
      return Response.json({
        done: true,
        done_reason: "stop",
        message: { content: JSON.stringify({ tags: ["展示"] }) },
      });
    });
    await client.json(
      { system: "分類", user: "展示", maxOutputTokens: 128 },
      z.object({ tags: z.array(z.string().max(30)).max(8) }),
    );
    const body = JSON.parse(requestBodies[0]!);
    assert.equal(body.options.num_predict, 128);
    assert.equal(body.options.temperature, 0);
    assert.deepEqual(body.options.stop, ["```"]);
    assert.equal(body.format.properties.tags.maxItems, 8);
    assert.equal(body.format.properties.tags.items.maxLength, 30);
    assert.ok(body.messages[0].content.includes('"maxLength":30'));
  });

  it("rejects a token-limited completion even if the partial JSON parses", async () => {
    const client = outputClient({ reason: "説明" }, async () =>
      Response.json({
        done: true,
        done_reason: "length",
        message: { content: '{"reason":"説明"}' },
      }),
    );
    await assert.rejects(
      client.json(
        { system: "理由", user: "説明" },
        z.object({ reason: z.string() }),
      ),
      (error) =>
        error instanceof OllamaOutputError && error.reason === "output_limit",
    );
  });

  it("rejects malformed, schema-invalid, and contaminated output without leaking its content", async () => {
    const parser = z.object({ reason: z.string().max(120) });
    const cases: [string, string][] = [
      ['{"reason":', "invalid_json"],
      ['{"reason":123}', "invalid_structure"],
      [
        JSON.stringify({ reason: "展示に適しています。```python```json" }),
        "invalid_text",
      ],
      ['{"reason":"展示\\u0060\\u0060\\u0060python"}', "invalid_text"],
      [
        JSON.stringify({
          reason: "展示に適しています。pythonpythonpythonpython",
        }),
        "invalid_text",
      ],
      [
        JSON.stringify({ reason: "<think>内部文章</think>展示です。" }),
        "invalid_text",
      ],
    ];
    for (const [content, reason] of cases) {
      const client = outputClient({}, async () =>
        Response.json({ done: true, message: { content } }),
      );
      await assert.rejects(
        client.json({ system: "理由", user: "説明" }, parser),
        (error) =>
          error instanceof OllamaOutputError &&
          error.reason === reason &&
          !error.message.includes(content),
      );
    }
    assert.deepEqual(
      await outputClient({ reason: "Pythonの勉強会です。" }).json(
        { system: "理由", user: "説明" },
        parser,
      ),
      { reason: "Pythonの勉強会です。" },
    );
  });

  it("rejects invalid token budgets before sending a request", async () => {
    const client = outputClient({}, async () => {
      throw new Error("Must not fetch");
    });
    for (const maxOutputTokens of [0, -1, 4097, 1.5])
      await assert.rejects(
        client.json(
          { system: "理由", user: "説明", maxOutputTokens },
          z.object({}),
        ),
        RangeError,
      );
  });

  it("bounds planning turns even when the model keeps calling an unknown tool", async () => {
    let calls = 0;
    const client = outputClient({}, async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.options.num_predict, 256);
      return Response.json({
        done: true,
        message: {
          content: "",
          tool_calls: [{ function: { name: "unknown", arguments: {} } }],
        },
      });
    });
    assert.deepEqual(
      await client.searchWithTool(
        {
          area: "東京都渋谷区",
          date: "2026-10-14",
          query: "展示",
          preferenceKeywords: [],
        },
        async () => {
          throw new Error("Unknown tools must not run");
        },
      ),
      [],
    );
    assert.equal(calls, 3);
  });

  it("returns a successful tool result without another model completion", async () => {
    let modelCalls = 0;
    const result = {
      title: "展示",
      url: "https://events.example/1",
      snippet: "説明",
    };
    const client = outputClient({}, async () => {
      modelCalls++;
      return Response.json({
        done: true,
        message: {
          content: "",
          tool_calls: [
            {
              function: {
                name: "search_events",
                arguments: { query: "東京都渋谷区 展示" },
              },
            },
          ],
        },
      });
    });
    assert.deepEqual(
      await client.searchWithTool(
        {
          area: "東京都渋谷区",
          date: "2026-10-14",
          query: "展示",
          preferenceKeywords: [],
        },
        async () => [result],
      ),
      [result],
    );
    assert.equal(modelCalls, 1);
  });

  it("distinguishes rejected output, request timeouts, and the discovery deadline", () => {
    assert.equal(
      ollamaFailureReason(new OllamaOutputError("output_limit")),
      "ollama_output_limit",
    );
    assert.equal(
      ollamaFailureReason(new OllamaOutputError("invalid_text")),
      "ollama_invalid_text",
    );
    assert.equal(
      ollamaFailureReason(new DOMException("Timed out", "TimeoutError")),
      "ollama_request_timeout",
    );
    assert.equal(
      ollamaFailureReason(
        new DOMException("Timed out", "TimeoutError"),
        AbortSignal.abort(),
      ),
      "event_discovery_timeout",
    );
    assert.equal(
      ollamaFailureReason(new Error("HTTP 503")),
      "ollama_request_unavailable",
    );
  });
});

function outputClient(
  output: unknown,
  implementation: typeof fetch = (async () =>
    Response.json({
      done: true,
      done_reason: "stop",
      message: { content: JSON.stringify(output) },
    })) as typeof fetch,
) {
  return new OllamaClient(
    "http://127.0.0.1:11434",
    "gemma4:e2b",
    "embeddinggemma:300m-qat-q4_0",
    implementation,
  );
}
