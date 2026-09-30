import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TransitApiClient, TransitApiError } from "./transit.js";
import { SearchTimingCollector } from "./search-timing.js";

describe("Transit API client", () => {
  it("routes to a nearby feed station and adds the walk to the venue", async () => {
    const requestedUrls: URL[] = [];
    const client = new TransitApiClient("https://api.transit.ls8h.com", (async (
      input: URL | RequestInfo,
    ) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      if (url.pathname === "/api/v1/places/reverse") {
        return Response.json({
          places: [
            {
              name: "渋谷",
              kind: "station",
              endpoint: "geo:35.658080,139.701765",
              lat: 35.65808,
              lon: 139.701765,
              distanceMeters: 12,
            },
          ],
        });
      }
      if (url.pathname === "/api/v1/locations/suggest") {
        return Response.json({
          stations: [
            {
              id: "rail:far-shibuya",
              name: "渋谷",
              kind: "station",
              lat: 35.661,
              lon: 139.704,
            },
            {
              id: "rail:shibuya",
              name: "渋谷",
              kind: "station",
              lat: 35.658517,
              lon: 139.701334,
            },
          ],
        });
      }
      return Response.json({
        journeys: [
          {
            durationSecs: 2_000,
            legs: [{ kind: "transit" }],
            fare: { currency: "JPY", ticket: 500, ic: 490 },
          },
          {
            durationSecs: 1_200,
            legs: [{ kind: "transit" }],
            fare: { currency: "JPY", ticket: 180, ic: 178 },
          },
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
    assert.ok((routes[0]?.destinationWalkSeconds ?? 0) > 0);
    assert.equal(
      routes[0]?.durationSeconds,
      1_200 + (routes[0]?.destinationWalkSeconds ?? 0),
    );
    assert.equal(routes[0]?.travelMode, "TRANSIT");
    assert.equal(routes[0]?.nearbyAreaName, "渋谷駅周辺");
    assert.deepEqual(routes[0]?.fare, {
      currency: "JPY",
      ticket: 180,
      ic: 178,
    });
    const reverseUrl = requestedUrls.find(
      (url) => url.pathname === "/api/v1/places/reverse",
    );
    assert.equal(reverseUrl?.searchParams.get("radiusMeters"), "500");
    const suggestionUrl = requestedUrls.find(
      (url) => url.pathname === "/api/v1/locations/suggest",
    );
    assert.equal(suggestionUrl?.searchParams.get("q"), "渋谷");
    const planUrl = requestedUrls.find(
      (url) => url.pathname === "/api/v1/plan",
    );
    assert.equal(planUrl?.searchParams.get("from"), "geo:35.681236,139.767125");
    assert.equal(planUrl?.searchParams.get("to"), "rail:shibuya");
    const routeTimings = timings.snapshot().stages.transitRouting;
    assert.equal(routeTimings.operations, 2);
    assert.equal(routeTimings.breakdown.nearbyStationLookup?.operations, 1);
    assert.equal(routeTimings.breakdown.routePlan?.operations, 1);
  });

  it("resolves a station before a closer stop and records the timing breakdown", async () => {
    let requestedUrl = "";
    const client = new TransitApiClient("https://api.transit.ls8h.com", (async (
      input: URL | RequestInfo,
    ) => {
      requestedUrl = String(input);
      return Response.json({
        places: [
          {
            name: "神宮前六丁目",
            kind: "stop",
            endpoint: "geo:35.6595,139.7004",
            lat: 35.6595,
            lon: 139.7004,
            distanceMeters: 30,
          },
          {
            name: "渋谷",
            kind: "station",
            endpoint: "geo:35.6595,139.7004",
            lat: 35.6595,
            lon: 139.7004,
            distanceMeters: 450,
          },
        ],
      });
    }) as typeof fetch);
    const timings = new SearchTimingCollector("job-area", undefined, () => {});
    const areas = await client.resolveNearbyAreas(
      [{ latitude: 35.6595, longitude: 139.7004 }],
      undefined,
      timings,
    );
    assert.deepEqual(areas, ["渋谷駅周辺"]);
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, "/api/v1/places/reverse");
    assert.equal(url.searchParams.get("radiusMeters"), "500");
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(
      timings.snapshot().stages.transitRouting.breakdown.nearbyStationLookup
        ?.operations,
      1,
    );
  });

  it("falls back to a nearby stop when no station is returned", async () => {
    const client = new TransitApiClient(
      "https://api.transit.ls8h.com",
      (async () =>
        Response.json({
          places: [
            {
              name: "神宮前六丁目",
              kind: "stop",
              endpoint: "geo:35.6595,139.7004",
              lat: 35.6595,
              lon: 139.7004,
              distanceMeters: 30,
            },
            {
              name: "商業施設",
              kind: "place",
              endpoint: "geo:35.6595,139.7004",
              lat: 35.6595,
              lon: 139.7004,
              distanceMeters: 10,
            },
          ],
        })) as typeof fetch,
    );
    assert.deepEqual(
      await client.resolveNearbyAreas([
        { latitude: 35.6595, longitude: 139.7004 },
      ]),
      ["神宮前六丁目周辺"],
    );
  });

  it("uses a nearby address when reverse lookup finds no transit station", async () => {
    const client = new TransitApiClient(
      "https://api.transit.ls8h.com",
      (async () =>
        Response.json({
          places: [
            {
              name: "小さな公園",
              kind: "place",
              source: "osm",
              endpoint: "geo:35.6595,139.7004",
              lat: 35.6595,
              lon: 139.7004,
              distanceMeters: 20,
            },
            {
              name: "東京都渋谷区神南一丁目",
              kind: "address",
              source: "geocoder",
              endpoint: "geo:35.6595,139.7004",
              lat: 35.6595,
              lon: 139.7004,
              distanceMeters: 300,
            },
          ],
        })) as typeof fetch,
    );
    assert.deepEqual(
      await client.resolveNearbyAreas([
        { latitude: 35.6595, longitude: 139.7004 },
      ]),
      ["東京都渋谷区神南一丁目周辺"],
    );
  });

  it("routes to the venue coordinates when no transit station can be resolved", async () => {
    const requestedUrls: URL[] = [];
    const client = new TransitApiClient("https://api.transit.ls8h.com", (async (
      input: URL | RequestInfo,
    ) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      if (url.pathname === "/api/v1/places/reverse") {
        return Response.json({ places: [] });
      }
      if (url.pathname === "/api/v1/plan") {
        return Response.json({
          journeys: [
            {
              durationSecs: 1_800,
              legs: [{ kind: "transit" }],
              fare: { currency: "JPY", ticket: 220, ic: 220 },
            },
          ],
        });
      }
      return new Response("unexpected request", { status: 404 });
    }) as typeof fetch);

    const routes = await client.computeRoutes(
      { latitude: 35.681236, longitude: 139.767125 },
      [{ latitude: 35.6595, longitude: 139.7004 }],
      new Date("2026-08-08T12:00:00+09:00"),
    );

    const planUrl = requestedUrls.find(
      (url) => url.pathname === "/api/v1/plan",
    );
    assert.equal(planUrl?.searchParams.get("to"), "geo:35.6595,139.7004");
    assert.equal(routes[0]?.durationSeconds, 1_800);
    assert.equal(routes[0]?.nearbyAreaName, undefined);
    assert.deepEqual(routes[0]?.fare, {
      currency: "JPY",
      ticket: 220,
      ic: 220,
    });
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
