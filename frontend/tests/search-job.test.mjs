import assert from "node:assert/strict";
import { it } from "node:test";
import { mergeSearchEvents, pollSearchJob } from "../src/services/searchJob.ts";

const event = (id, reason = "定型文") => ({
  id,
  date: "2026/10/15",
  time: "時間未確認",
  location: "確認済み会場",
  recommendationReason: reason,
  coordinates: { latitude: 35, longitude: 139 },
});
const meta = { source: "cache", degradedReasons: [] };
const start = async () => ({ jobId: "search-1", pollUrl: "/job" });
const job = (revision, status, events) => ({
  jobId: "search-1",
  revision,
  status,
  events,
  meta,
});

it("merges reason updates without moving cards or remounting unchanged map coordinates", () => {
  const first = [event("b"), event("a")];
  const next = mergeSearchEvents(first, [
    event("a", "生成済み"),
    event("b"),
    event("c"),
    event("c"),
  ]);
  assert.deepEqual(
    next.map((e) => e.id),
    ["b", "a", "c"],
  );
  assert.equal(next[1].recommendationReason, "生成済み");
  assert.equal(next[1].coordinates, first[1].coordinates);
});

it("publishes running results and generated reasons before terminal completion, ignoring stale revisions", async () => {
  const updates = [];
  const jobs = [
    job(1, "running", [event("b")]),
    job(0, "running", [event("a")]),
    job(2, "running", [event("a"), event("b", "生成済み")]),
    job(3, "succeeded", [event("a"), event("b", "生成済み")]),
  ];
  const result = await pollSearchJob({
    start,
    read: async () => jobs.shift(),
    intervalMs: 1,
    onProgress: (u) => updates.push(u),
  });
  assert.deepEqual(
    updates.map((u) => u.revision),
    [1, 2, 3],
  );
  assert.deepEqual(
    updates[0].events.map((e) => e.id),
    ["b"],
  );
  assert.deepEqual(
    result.events.map((e) => e.id),
    ["b", "a"],
  );
  assert.equal(result.events[0].recommendationReason, "生成済み");
});

it("supports old terminal-only jobs", async () => {
  const result = await pollSearchJob({
    start,
    read: async () => ({
      jobId: "search-1",
      status: "succeeded",
      events: [event("a")],
      meta,
    }),
    intervalMs: 1,
  });
  assert.equal(result.events[0].id, "a");
});

for (const failure of ["job", "network", "timeout"]) {
  it(`delivers confirmed candidates before ${failure} failure`, async () => {
    let reads = 0;
    const updates = [];
    await assert.rejects(
      pollSearchJob({
        start,
        intervalMs: 1,
        timeoutMs: 30,
        read: async () => {
          if (++reads === 1) return job(1, "running", [event("a")]);
          if (failure === "network") throw new Error("network failed");
          if (failure === "timeout") return new Promise(() => {});
          return {
            ...job(2, "failed", [event("a")]),
            error: { message: "interrupted" },
          };
        },
        onProgress: (u) => updates.push(u),
      }),
    );
    assert.equal(updates.at(-1).events[0].id, "a");
  });
}

it("stops polling and callbacks when a newer search, logout or unmount cancels it", async () => {
  const controller = new AbortController();
  const updates = [];
  let reads = 0;
  await assert.rejects(
    pollSearchJob({
      start,
      signal: controller.signal,
      intervalMs: 1,
      read: async () => {
        reads++;
        return job(1, "running", [event("a")]);
      },
      onProgress: (u) => {
        updates.push(u);
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(reads, 1);
  assert.equal(updates.length, 1);
});

it("rejects snapshots for a different job", async () => {
  await assert.rejects(
    pollSearchJob({
      start,
      intervalMs: 1,
      read: async () => ({
        ...job(1, "succeeded", [event("a")]),
        jobId: "another-job",
      }),
    }),
    /一致しません/,
  );
});

it("cancels an in-flight request and ignores its late result", async () => {
  const controller = new AbortController();
  let release;
  let ready;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  const updates = [];
  const pending = pollSearchJob({
    start,
    signal: controller.signal,
    intervalMs: 1,
    read: () =>
      new Promise((resolve) => {
        release = resolve;
        ready();
      }),
    onProgress: (update) => updates.push(update),
  });
  await started;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  release(job(1, "succeeded", [event("a")]));
  await Promise.resolve();
  assert.equal(updates.length, 0);
});
