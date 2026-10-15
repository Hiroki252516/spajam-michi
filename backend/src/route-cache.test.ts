import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TransitApiClient, TransitApiError } from "./transit.js";

const origin = { latitude: 35.4658, longitude: 139.6223 };
const venue = { latitude: 35.45401, longitude: 139.638935 };
const start = Date.parse("2026-10-15T12:00:00+09:00");
const journey = () =>
  Response.json({
    journeys: [
      {
        durationSecs: 1200,
        legs: [{ kind: "transit" }],
        fare: { currency: "JPY", ticket: 200, ic: 198 },
      },
    ],
  });

function fixture() {
  let now = start;
  const calls: URL[] = [];
  const client = new TransitApiClient(
    "https://api.transit.ls8h.com",
    async (url) => {
      const parsed = new URL(String(url));
      calls.push(parsed);
      return parsed.pathname === "/api/v1/plan"
        ? journey()
        : Response.json({ places: [] });
    },
    () => now,
  );
  return {
    client,
    calls,
    advance: (ms: number) => {
      now += ms;
    },
    date: () => new Date(now),
  };
}

describe("short lived route cache", () => {
  it("removes expired coordinates from memory even when no new search arrives", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const f = fixture();
    await f.client.computeRoutes(origin, [venue], f.date());
    const cache = Reflect.get(f.client, "routeCache") as Map<string, unknown>;
    assert.equal(cache.size, 1);
    f.advance(180_000);
    context.mock.timers.tick(180_000);
    assert.equal(cache.size, 0);
  });
  it("reuses a successful route within 30m and recalculates distance/index without extending its expiry", async () => {
    const f = fixture();
    const first = (await f.client.computeRoutes(origin, [venue], f.date()))[0]!;
    first.fare!.ic = 1;
    f.advance(60_000);
    const moved = { ...origin, latitude: origin.latitude + 0.0001 };
    const second = (
      await f.client.computeRoutes(moved, [venue, venue], f.date())
    )[1]!;
    assert.equal(f.calls.length, 2);
    assert.equal(second.routeCached, true);
    assert.equal(second.routeCalculatedAt, new Date(start).toISOString());
    assert.equal(second.destinationIndex, 1);
    assert.equal(second.fare?.ic, 198);
    assert.notEqual(second.distanceMeters, first.distanceMeters);
    f.advance(119_999);
    await f.client.computeRoutes(origin, [venue], f.date());
    assert.equal(f.calls.length, 2);
    f.advance(1);
    assert.equal(
      (await f.client.computeRoutes(origin, [venue], f.date()))[0]?.routeCached,
      false,
    );
    assert.equal(f.calls.length, 4);
  });

  it("misses after movement, destination changes, departure changes, day changes and configuration changes", async () => {
    const f = fixture();
    await f.client.computeRoutes(origin, [venue], f.date());
    await f.client.computeRoutes(
      { ...origin, latitude: origin.latitude + 0.0004 },
      [venue],
      f.date(),
    );
    await f.client.computeRoutes(
      origin,
      [{ ...venue, longitude: venue.longitude + 0.00001 }],
      f.date(),
    );
    await f.client.computeRoutes(origin, [venue], new Date(start - 1));
    assert.equal(f.calls.length, 8);
    const midnight = Date.parse("2026-10-15T23:59:00+09:00");
    const calls: URL[] = [];
    const fetcher: typeof fetch = async (url) => {
      const parsed = new URL(String(url));
      calls.push(parsed);
      return parsed.pathname === "/api/v1/plan"
        ? journey()
        : Response.json({ places: [] });
    };
    const client = new TransitApiClient(
      "https://transit.example/",
      fetcher,
      () => midnight,
    );
    await client.computeRoutes(origin, [venue], new Date(midnight));
    await client.computeRoutes(origin, [venue], new Date(midnight + 60_000));
    const changed = new TransitApiClient(
      "https://other-transit.example/",
      fetcher,
      () => midnight,
    );
    await changed.computeRoutes(origin, [venue], new Date(midnight));
    assert.equal(calls.length, 6);
    assert.equal(calls[4]?.hostname, "other-transit.example");
  });

  it("does not cache HTTP errors or valid empty journeys", async () => {
    for (const failure of [503, 0]) {
      let attempts = 0;
      const client = new TransitApiClient(
        "https://api.transit.ls8h.com",
        async (url) => {
          if (new URL(String(url)).pathname !== "/api/v1/plan")
            return Response.json({ places: [] });
          attempts += 1;
          if (attempts === 1)
            return failure
              ? new Response(null, { status: failure })
              : Response.json({ journeys: [] });
          return journey();
        },
        () => start,
      );
      if (failure)
        await assert.rejects(
          client.computeRoutes(origin, [venue], new Date(start)),
          TransitApiError,
        );
      else
        assert.equal(
          (await client.computeRoutes(origin, [venue], new Date(start)))[0],
          null,
        );
      assert.equal(
        (await client.computeRoutes(origin, [venue], new Date(start)))[0]
          ?.routeCached,
        false,
      );
      assert.equal(attempts, 2);
    }
  });

  it("evicts the least recently used route beyond 1000 entries", async () => {
    const f = fixture();
    const venues = Array.from({ length: 1001 }, (_, index) => ({
      ...venue,
      latitude: venue.latitude + index * 0.00001,
    }));
    await f.client.computeRoutes(origin, venues, f.date());
    const count = f.calls.length;
    assert.equal(
      (await f.client.computeRoutes(origin, [venues.at(-1)!], f.date()))[0]
        ?.routeCached,
      true,
    );
    assert.equal(f.calls.length, count);
    assert.equal(
      (await f.client.computeRoutes(origin, [venues[0]!], f.date()))[0]
        ?.routeCached,
      false,
    );
    assert.equal(f.calls.length, count + 2);
  });

  it("notifies a fast route before a slow request finishes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const fast = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const order: number[] = [];
    const slowVenue = { ...venue, latitude: venue.latitude + 0.001 };
    const client = new TransitApiClient(
      "https://api.transit.ls8h.com",
      async (url) => {
        const parsed = new URL(String(url));
        if (parsed.pathname !== "/api/v1/plan")
          return Response.json({ places: [] });
        if (
          parsed.searchParams.get("to") ===
          `geo:${slowVenue.latitude},${slowVenue.longitude}`
        )
          await gate;
        return journey();
      },
      () => start,
    );
    let finished = false;
    const pending = client
      .computeRoutes(
        origin,
        [slowVenue, venue],
        new Date(start),
        undefined,
        undefined,
        async (index) => {
          order.push(index);
          if (index === 1) ready();
        },
      )
      .then(() => {
        finished = true;
      });
    await fast;
    assert.equal(finished, false);
    assert.deepEqual(order, [1]);
    release();
    await pending;
    assert.deepEqual(order, [1, 0]);
  });
});
