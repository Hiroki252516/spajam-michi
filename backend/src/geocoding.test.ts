import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DuckDuckGoCoordinateResolver,
  GsiGeocoder,
  LocationResolutionError,
} from "./geocoding.js";
import { OllamaClient } from "./ollama.js";
import { SearchTimingCollector } from "./search-timing.js";

describe("geocoding", () => {
  it("sends the Expo coordinates to DuckDuckGo and accepts a sourced area", async () => {
    let receivedQuery = "";
    const webSearch = {
      search: async (query: string) => {
        receivedQuery = query;
        return [
          {
            title: "東京駅 - 東京都千代田区",
            snippet: "東京駅は東京都千代田区丸の内にあります。",
            url: "https://example.com/tokyo-station",
          },
        ];
      },
    };
    const ollama = ollamaReturning({ area: "東京都 千代田区" });
    const resolver = new DuckDuckGoCoordinateResolver(webSearch, ollama);
    const timings = new SearchTimingCollector(
      "job-location",
      undefined,
      () => {},
    );

    assert.equal(
      await resolver.resolve(
        { latitude: 35.681236, longitude: 139.767125 },
        undefined,
        timings,
      ),
      "東京都 千代田区",
    );
    assert.match(receivedQuery, /35\.681236 139\.767125 住所 地名/u);
    assert.equal(timings.snapshot().stages.duckDuckGoSearch.operations, 1);
    assert.equal(timings.snapshot().stages.gemmaAnalysis.operations, 1);
  });

  it("rejects a locality that is not present in DuckDuckGo results", async () => {
    const resolver = new DuckDuckGoCoordinateResolver(
      {
        search: async () => [
          {
            title: "座標検索の方法",
            snippet: "緯度経度を地図で検索できます。",
            url: "https://example.com/how-to",
          },
        ],
      },
      ollamaReturning({ area: "東京都 千代田区" }),
    );
    await assert.rejects(
      resolver.resolve({ latitude: 35.681236, longitude: 139.767125 }),
      LocationResolutionError,
    );
  });

  it("converts a source-page address with the GSI address search API", async () => {
    let requestedUrl = "";
    const geocoder = new GsiGeocoder((async (input: URL | RequestInfo) => {
      requestedUrl = String(input);
      return Response.json([
        { geometry: { coordinates: [139.767242, 35.681252] } },
      ]);
    }) as typeof fetch);
    assert.deepEqual(await geocoder.geocode("東京都千代田区丸の内1-9-1"), {
      latitude: 35.681252,
      longitude: 139.767242,
    });
    assert.match(requestedUrl, /msearch\.gsi\.go\.jp/u);
    assert.match(requestedUrl, /q=/u);
  });
});

function ollamaReturning(value: unknown) {
  const fakeFetch = (async () =>
    Response.json({
      message: { role: "assistant", content: JSON.stringify(value) },
    })) as typeof fetch;
  return new OllamaClient(
    "http://127.0.0.1:11434",
    "gemma4:e2b",
    "embeddinggemma:300m-qat-q4_0",
    fakeFetch,
  );
}
