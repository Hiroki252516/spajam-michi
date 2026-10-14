import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCleanRecommendationReason } from "./llm-output.js";
import { OllamaClient } from "./ollama.js";
import {
  generateRecommendationReasons,
  type ReasonCandidate,
} from "./recommendation-reasons.js";

const candidate = (eventId: string): ReasonCandidate => ({
  eventId,
  description: "展示を鑑賞するイベント",
  travelMinutes: 20,
  travelMode: "TRANSIT",
  preferenceScore: 0.8,
});
const client = (implementation: typeof fetch) =>
  new OllamaClient(
    "http://127.0.0.1:11434",
    "gemma4:e2b",
    "embeddinggemma:300m-qat-q4_0",
    implementation,
  );

describe("bounded recommendation reasons", () => {
  it("batches three candidates and constrains text and IDs during generation", async () => {
    const batches: string[][] = [];
    const failures: unknown[] = [];
    const reasons = await generateRecommendationReasons({
      ollama: client(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const events = JSON.parse(body.messages[1].content)
          .events as ReasonCandidate[];
        const ids = events.map((event) => event.eventId);
        batches.push(ids);
        assert.deepEqual(
          Object.keys(body.format.properties.reasons.properties),
          ids,
        );
        assert.equal(
          body.format.properties.reasons.additionalProperties,
          false,
        );
        assert.equal(
          body.format.properties.reasons.properties[ids[0]!].maxLength,
          120,
        );
        assert.ok(body.options.num_predict <= 512);
        assert.ok(events.every((event) => event.description.length <= 240));
        return Response.json({
          message: {
            content: JSON.stringify({
              reasons: Object.fromEntries(
                ids.map((id) => [
                  id,
                  "展示の好みに合い、約20分で移動できます。",
                ]),
              ),
            }),
          },
        });
      }),
      candidates: ["a", "b", "c", "d"].map((id) => ({
        ...candidate(id),
        description: "展示".repeat(250),
      })),
      preferenceKeywords: ["展示"],
      onFailure: (error) => failures.push(error),
    });
    assert.deepEqual(batches, [["a", "b", "c"], ["d"]]);
    assert.equal(reasons.size, 4);
    assert.deepEqual(failures, []);
  });

  it("rejects missing and invented IDs and code fragments", async () => {
    for (const reasons of [
      { invented: "展示の好みに合います。" },
      { a: "展示の好みに合います。", invented: "余計な理由です。" },
      { a: "移動できます。}]}```python```json" },
      { a: "展示の好みに合います。\nprint()" },
      { a: "pythonpythonpythonpython" },
      { a: " " },
    ]) {
      const failures: unknown[] = [];
      const result = await generateRecommendationReasons({
        ollama: client(async () =>
          Response.json({ message: { content: JSON.stringify({ reasons }) } }),
        ),
        candidates: [candidate("a")],
        preferenceKeywords: [],
        onFailure: (error) => failures.push(error),
      });
      assert.equal(result.size, 0);
      assert.equal(failures.length, 1);
    }
  });

  it("keeps valid batches when another batch fails or the caller cancels", async () => {
    for (const cancel of [false, true]) {
      let calls = 0;
      const controller = new AbortController();
      const failures: unknown[] = [];
      const result = await generateRecommendationReasons({
        ollama: client(async (_url, init) => {
          calls++;
          if (calls > 1)
            return Response.json({ message: { content: "broken JSON" } });
          const ids = JSON.parse(
            JSON.parse(String(init?.body)).messages[1].content,
          ).events.map((event: ReasonCandidate) => event.eventId);
          if (cancel) controller.abort();
          return Response.json({
            message: {
              content: JSON.stringify({
                reasons: Object.fromEntries(
                  ids.map((id: string) => [id, "展示の好みに合います。"]),
                ),
              }),
            },
          });
        }),
        candidates: ["a", "b", "c", "d"].map(candidate),
        preferenceKeywords: [],
        signal: controller.signal,
        onFailure: (error) => failures.push(error),
      });
      assert.deepEqual([...result.keys()], ["a", "b", "c"]);
      assert.equal(calls, cancel ? 1 : 2);
      assert.equal(failures.length, 1);
    }
  });

  it("validates prose without excluding legitimate Python event descriptions", () => {
    assert.equal(
      isCleanRecommendationReason(
        "Pythonの学習に関心があり、約20分で移動できる候補です。",
      ),
      true,
    );
    for (const text of [
      "展示です。```python",
      "展示です。<think>推論</think>",
      "展示です。console.log(1)",
      "展示です。python python python",
      "Plain English only",
      "あ".repeat(121),
    ])
      assert.equal(isCleanRecommendationReason(text), false);
  });
});
