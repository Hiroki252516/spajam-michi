import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closingTime,
  eventIdentity,
  isDetailedAddress,
  isSpecificVenueName,
  neighborhoodName,
  normalizeSearchArea,
  uniqueEvents,
  verifiedVenue,
} from "./event-quality.js";
import { formatEventTime } from "./event-display.js";

describe("event provenance and schedules", () => {
  it("accepts administrative search areas but rejects landmarks, addresses, and URLs", () => {
    assert.equal(
      normalizeSearchArea("神奈川県 横浜市 中区"),
      "神奈川県横浜市中区",
    );
    for (const value of [
      undefined,
      "中区役所周辺",
      "神奈川県横浜市中区山下町1-1",
      "https://example.com",
      "東京都",
    ])
      assert.equal(normalizeSearchArea(value), null);
    assert.equal(isDetailedAddress("神奈川県横浜市中区"), false);
    assert.equal(isDetailedAddress("神奈川県横浜市中区山下町193"), true);
    assert.equal(isDetailedAddress("神奈川県横浜市中区山下町193番地"), true);
    assert.equal(
      neighborhoodName("神奈川県横浜市中区山下町193番地"),
      "横浜市中区山下町周辺",
    );
    assert.equal(neighborhoodName("赤レンガ倉庫"), "会場周辺");
    assert.equal(isSpecificVenueName("8階　催会場"), false);
    assert.equal(isSpecificVenueName("横浜市中区周辺"), false);
    assert.equal(isSpecificVenueName("横浜赤レンガ倉庫２号館１階"), true);
  });
  it("deduplicates across publications while retaining distinct venues", () => {
    const event = {
      name: "展示 A",
      startsAt: new Date("2026-10-14T01:00:00Z"),
      endsAt: new Date("2026-10-14T10:00:00Z"),
      location: "東京都渋谷区神南1-1-1",
    };
    assert.equal(
      eventIdentity(event),
      eventIdentity({ ...event, name: "展示　Ａ" }),
    );
    assert.equal(
      uniqueEvents([
        event,
        { ...event },
        { ...event, location: "東京都渋谷区神南2-2-2" },
      ]).length,
      2,
    );
  });
  it("does not accept legacy, stale, or invalid-coordinate venue records", () => {
    const now = new Date("2026-10-14T00:00:00Z");
    const venue = {
      venueVerified: true,
      venueVerifiedAt: now,
      coordinateSource: "source_page" as const,
      venueName: "横浜の展示会場",
      latitude: 35.4,
      longitude: 139.6,
    };
    assert.equal(verifiedVenue(venue, now), true);
    assert.equal(verifiedVenue({ ...venue, venueVerified: false }, now), false);
    assert.equal(
      verifiedVenue(
        { ...venue, venueVerifiedAt: new Date(now.getTime() - 25 * 3600000) },
        now,
      ),
      false,
    );
    assert.equal(verifiedVenue({ ...venue, latitude: 0 }, now), false);
    assert.equal(
      verifiedVenue(
        { ...venue, venueName: "8階 催会場", location: "横浜駅(西口)" },
        now,
      ),
      false,
    );
  });
  it("shows unknown time for multi-day date-only events and retains explicit all-day times", () => {
    const start = new Date("2026-10-01T00:00:00+09:00");
    const end = new Date("2026-10-31T23:59:59.999+09:00");
    assert.equal(formatEventTime(start, end, "date_only"), "時間未確認");
    assert.equal(formatEventTime(start, end), "時間未確認");
    assert.equal(
      formatEventTime(start, end, "date_only", "12:00〜15:30(LO13:30) 120分制"),
      "12:00〜15:30(LO13:30) 120分制",
    );
    assert.equal(
      formatEventTime(start, new Date("2026-10-01T23:59:59+09:00"), "datetime"),
      "00:00-23:59",
    );
  });
  it("computes daily closing and midnight crossing without inventing complex schedules", () => {
    const schedule = {
      startsAt: new Date("2026-10-01T00:00:00+09:00"),
      endsAt: new Date("2026-10-31T23:59:59+09:00"),
      hoursText: "12:00〜15:30",
    };
    assert.equal(
      closingTime(
        schedule,
        new Date("2026-10-14T00:10:00+09:00"),
      )?.toISOString(),
      "2026-10-14T06:30:00.000Z",
    );
    assert.equal(
      closingTime(
        { ...schedule, hoursText: "22:00〜03:00" },
        new Date("2026-10-14T23:00:00+09:00"),
      )?.toISOString(),
      "2026-10-14T18:00:00.000Z",
    );
    assert.equal(
      closingTime(
        { ...schedule, hoursText: "平日12:00〜15:30、土日10:00〜18:00" },
        new Date(),
      ),
      null,
    );
    for (const hoursText of [
      "11:00〜20:00 ※10/3(土)のみ11時〜15時、入店制限あり",
      "10:00〜20:00 火曜定休",
      "10:00〜20:00 月〜金の開催",
      "10:00〜20:00、別会場は12時〜15時",
    ])
      assert.equal(closingTime({ ...schedule, hoursText }, new Date()), null);
  });
});
