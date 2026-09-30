import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatEventTime } from "./event-display.js";

describe("event display time", () => {
  it("labels a date-only event as time unknown", () => {
    assert.equal(
      formatEventTime(
        new Date("2026-08-08T00:00:00+09:00"),
        new Date("2026-08-08T23:59:59.999+09:00"),
      ),
      "時間未定",
    );
  });

  it("keeps an explicitly timed event's range", () => {
    assert.equal(
      formatEventTime(
        new Date("2026-08-08T18:00:00+09:00"),
        new Date("2026-08-08T20:00:00+09:00"),
      ),
      "18:00-20:00",
    );
  });
});
