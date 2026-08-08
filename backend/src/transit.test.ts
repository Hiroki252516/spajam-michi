import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TransitApiClient, TransitApiError } from "./transit.js";
import { SearchTimingCollector } from "./search-timing.js";

describe("Transit API client", () => {
  it("uses geo coordinates and selects the fastest returned journey", async () => {
    let requestedUrl = "";
    const client = new TransitApiClient("https://api.transit.ls8h.com", (async (
      input: URL | RequestInfo,
    ) => {
      requestedUrl = String(input);
      return Response.json({
        journeys: [
          { durationSecs: 2_000, legs: [{ kind: "transit" }] },
          { durationSecs: 1_200, legs: [{ kind: "transit" }] },
        ],
      });
    }) as typeof fetch);
    const timings = new SearchTimingCollector("job-route", undefined, () => {});
    const routes = await client.computeRoutes(
      { latitude: 35.681236, longitude: 139.767125 },
      [{ latitude: 35.658034, longitude: 139.701636 }],
      new Date("2026-08-08T09:00:00+09:00"),
      undefined,
      timings,
    );
    assert.equal(routes[0]?.durationSeconds, 1_200);
    assert.equal(routes[0]?.travelMode, "TRANSIT");
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, "/api/v1/plan");
    assert.equal(url.searchParams.get("from"), "geo:35.681236,139.767125");
    assert.equal(url.searchParams.get("to"), "geo:35.658034,139.701636");
    assert.equal(timings.snapshot().stages.transitRouting.operations, 1);
  });

  it("fails when every Transit API request fails", async () => {
    const client = new TransitApiClient(
      "https://api.transit.ls8h.com",
      (async () =>
        new Response("unavailable", { status: 503 })) as typeof fetch,
    );
    await assert.rejects(
      client.computeRoutes(
        { latitude: 35.68, longitude: 139.76 },
        [{ latitude: 35.65, longitude: 139.7 }],
        new Date(),
      ),
      TransitApiError,
    );
  });
});
