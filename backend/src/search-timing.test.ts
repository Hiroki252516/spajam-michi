import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SearchTimingCollector } from "./search-timing.js";

describe("search timing collector", () => {
  it("separates wall time from cumulative time for overlapping operations", async () => {
    let now = 0;
    const pending: (() => void)[] = [];
    const collector = new SearchTimingCollector(
      "job-1",
      () => now,
      () => {},
    );
    const first = collector.measure("eventPageFetch", "pageFetch", async () => {
      await new Promise<void>((resolve) => pending.push(resolve));
    });
    now = 5;
    const second = collector.measure(
      "eventPageFetch",
      "pageFetch",
      async () => {
        await new Promise<void>((resolve) => pending.push(resolve));
      },
    );
    now = 20;
    pending.shift()?.();
    await first;
    now = 25;
    pending.shift()?.();
    await second;

    const stage = collector.snapshot().stages.eventPageFetch;
    assert.equal(stage.wallMs, 25);
    assert.equal(stage.cumulativeMs, 40);
    assert.equal(stage.operations, 2);
    assert.equal(stage.averageMs, 20);
    assert.equal(stage.breakdown.pageFetch?.operations, 2);
  });

  it("records failures, skipped stages, and privacy-safe structured logs", async () => {
    let now = 0;
    const logs: string[] = [];
    const collector = new SearchTimingCollector(
      "job-safe",
      () => now,
      (message) => logs.push(message),
    );
    await assert.rejects(
      collector.measure("gsiGeocoding", "venueGeocoding", async () => {
        now = 12;
        throw new Error("failed");
      }),
    );
    collector.skip("transitRouting", "no_candidates");
    const timings = collector.snapshot();
    collector.logStages(["gsiGeocoding", "transitRouting"]);
    collector.logSummary("failed", timings);

    assert.equal(timings.stages.gsiGeocoding.status, "failed");
    assert.equal(timings.stages.transitRouting.skipReason, "no_candidates");
    assert.equal(logs.length, 3);
    assert.ok(logs.every((message) => !message.includes("latitude")));
    assert.ok(logs.every((message) => !message.includes("https://")));
  });

  it("does not count idle gaps as stage wall time", async () => {
    let now = 0;
    const collector = new SearchTimingCollector(
      "job-gap",
      () => now,
      () => {},
    );
    await collector.measure("ragRecommendation", "memoryLoad", async () => {
      now = 10;
    });
    now = 30;
    await collector.measure("ragRecommendation", "ranking", async () => {
      now = 40;
    });
    const stage = collector.snapshot().stages.ragRecommendation;
    assert.equal(stage.wallMs, 20);
    assert.equal(stage.cumulativeMs, 20);
  });
});
