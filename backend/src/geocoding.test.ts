import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GsiGeocoder, GsiGeocodingError } from "./geocoding.js";

describe("venue geocoding", () => {
  it("accepts coordinates of a matching street/block and caches the lookup", async () => {
    let calls = 0;
    const geocoder = new GsiGeocoder((async () => {
      calls += 1;
      return Response.json([
        {
          properties: { title: "東京都千代田区丸の内一丁目９番" },
          geometry: { coordinates: [139.767242, 35.681252] },
        },
      ]);
    }) as typeof fetch);
    assert.deepEqual(await geocoder.geocode("東京都千代田区丸の内1-9-1"), {
      latitude: 35.681252,
      longitude: 139.767242,
    });
    await geocoder.geocode("東京都千代田区丸の内1-9-1");
    assert.equal(calls, 1);
  });
  it("rejects area-only input and broad or unrelated results", async () => {
    let calls = 0;
    const geocoder = new GsiGeocoder((async () => {
      calls += 1;
      return Response.json([
        {
          properties: { title: "東京都千代田区" },
          geometry: { coordinates: [139.767242, 35.681252] },
        },
        {
          properties: { title: "東京都渋谷区神南1-9" },
          geometry: { coordinates: [139.7, 35.66] },
        },
      ]);
    }) as typeof fetch);
    await assert.rejects(geocoder.geocode("東京都千代田区"), GsiGeocodingError);
    assert.equal(calls, 0);
    await assert.rejects(
      geocoder.geocode("東京都千代田区丸の内1-9-1"),
      GsiGeocodingError,
    );
  });
});
