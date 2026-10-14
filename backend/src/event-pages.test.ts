import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventPageCrawler } from "./event-pages.js";

function detail(name = "展示", sourceCoordinates = false) {
  return `<html><body><script type="application/ld+json">${JSON.stringify({ "@type": "Event", name, startDate: "2026-10-01", endDate: "2026-10-31", location: { "@type": "Place", name: "横浜会場", address: { addressRegion: "神奈川県", addressLocality: "横浜市中区", streetAddress: "神奈川県横浜市中区山下町193番地" } } })}</script><dl><dt>開催時間</dt><dd>12:00〜15:30</dd></dl>${sourceCoordinates ? '<iframe src="https://www.google.com/maps/embed/v1/place?q=35.4437,139.6380&amp;center=35.5,139.7"></iframe>' : ""}</body></html>`;
}

describe("event detail crawling", () => {
  it("follows a listing to its detail/map and supplements JSON-LD dates", async () => {
    const requested: string[] = [];
    const root = "https://www.walkerplus.com/event_list/today/";
    const event = "https://www.walkerplus.com/event/ar0314e123456/";
    const crawler = new EventPageCrawler({
      signal: AbortSignal.timeout(1000),
      timeoutMs: 100,
      onIssue: () => {},
      fetchPage: async (url) => {
        requested.push(url);
        return {
          url,
          html:
            url === root
              ? `<a href="${event}">展示</a>`
              : detail("展示", url.endsWith("map.html")),
        };
      },
    });
    const events = await crawler.crawl([root]);
    assert.deepEqual(requested, [root, event, `${event}map.html`]);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.address, "神奈川県横浜市中区山下町193番地");
    assert.equal(events[0]?.hoursText, "12:00〜15:30");
    assert.equal(events[0]?.timePrecision, "date_only");
    assert.deepEqual(events[0]?.sourceCoordinates, {
      latitude: 35.4437,
      longitude: 139.638,
    });
    assert.equal(events[0]?.coordinateSourceUrl, `${event}map.html`);
  });
  it("does not use a camera center as venue coordinates", async () => {
    const crawler = new EventPageCrawler({
      signal: AbortSignal.timeout(1000),
      timeoutMs: 100,
      onIssue: () => {},
      fetchPage: async (url) => ({
        url,
        html: detail().replace(
          "</body>",
          '<iframe src="https://www.google.com/maps/embed/v1/place?center=35.4,139.6"></iframe></body>',
        ),
      }),
    });
    const events = await crawler.crawl([
      "https://www.walkerplus.com/event/ar0314e123456/map.html",
    ]);
    assert.equal(events[0]?.sourceCoordinates, undefined);
  });
  it("bounds requests/depth and observes cancellation", async () => {
    let calls = 0;
    const crawler = new EventPageCrawler({
      signal: AbortSignal.timeout(1000),
      timeoutMs: 100,
      onIssue: () => {},
      fetchPage: async (url) => {
        calls += 1;
        return {
          url,
          html: Array.from(
            { length: 20 },
            (_, i) => `<a href="/event/ar0314e${100000 + i}/">展示</a>`,
          ).join(""),
        };
      },
    });
    await crawler.crawl(["https://www.walkerplus.com/event_list/today/"]);
    await crawler.crawl(["https://www.walkerplus.com/event_list/tomorrow/"]);
    assert.equal(calls, 10);
    const cancelled = new EventPageCrawler({
      signal: AbortSignal.abort(),
      timeoutMs: 100,
      onIssue: () => {},
      fetchPage: async () => {
        throw new Error("Must not fetch");
      },
    });
    assert.deepEqual(
      await cancelled.crawl(["https://example.com/event/1"]),
      [],
    );
  });

  it("does not follow links beyond depth two", async () => {
    const requested: string[] = [];
    const crawler = new EventPageCrawler({
      signal: AbortSignal.timeout(1000),
      timeoutMs: 100,
      onIssue: () => {},
      fetchPage: async (url) => {
        requested.push(url);
        const n = Number(new URL(url).pathname.split("/").pop());
        return { url, html: `<a href="/events/${n + 1}">次のイベント</a>` };
      },
    });
    await crawler.crawl(["https://events.example/events/0"]);
    assert.deepEqual(requested, [
      "https://events.example/events/0",
      "https://events.example/events/1",
      "https://events.example/events/2",
    ]);
  });
});
