import { load } from "cheerio";
import {
  extractEventsFromHtml,
  type ExtractedEvent,
} from "./event-extractor.js";
import { eventIdentity } from "./event-quality.js";
import type { OllamaClient } from "./ollama.js";
import { fetchPublicHtml } from "./safe-fetch.js";
import {
  measureSearchTiming,
  type SearchTimingCollector,
} from "./search-timing.js";

export function canonicalPageUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid|gclid)/u.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function relatedEventPages(sourceUrl: string, html: string) {
  const source = new URL(sourceUrl);
  const $ = load(html);
  const links: string[] = [];
  if (source.hostname === "www.walkerplus.com") {
    if (/^\/event\/ar\d+e\d+\/$/u.test(source.pathname)) {
      links.push(new URL("map.html", source).toString());
    } else if (/\/event_list\//u.test(source.pathname)) {
      $("a[href]").each((_, el) => {
        try {
          const url = new URL($(el).attr("href")!, source);
          if (
            url.hostname === source.hostname &&
            /^\/event\/ar\d+e\d+\/$/u.test(url.pathname)
          )
            links.push(url.toString());
        } catch {
          return;
        }
      });
    }
  } else {
    $("a[href]").each((_, el) => {
      try {
        const url = new URL($(el).attr("href")!, source);
        if (
          url.hostname === source.hostname &&
          /\/(?:events?|eventinfo)\/[\w-]+/u.test(url.pathname) &&
          url.pathname !== source.pathname
        )
          links.push(url.toString());
      } catch {
        return;
      }
    });
  }
  return [...new Set(links.map(canonicalPageUrl))];
}

export class EventPageCrawler {
  private readonly visited = new Set<string>();
  private readonly extracted: ExtractedEvent[] = [];
  private fetched = 0;
  constructor(
    private readonly options: {
      signal: AbortSignal;
      timeoutMs: number;
      ollama?: OllamaClient;
      timings?: SearchTimingCollector;
      onIssue: (reason: string) => void;
      fetchPage?: typeof fetchPublicHtml;
    },
  ) {}

  async crawl(roots: string[]) {
    const queue = roots.map((url) => ({ url, depth: 0 }));
    while (
      queue.length &&
      this.visited.size < 10 &&
      !this.options.signal.aborted
    ) {
      const next = queue.shift()!;
      let url: string;
      try {
        url = canonicalPageUrl(next.url);
      } catch {
        continue;
      }
      if (this.visited.has(url)) continue;
      this.visited.add(url);
      try {
        const page = await measureSearchTiming(
          this.options.timings,
          "eventPageFetch",
          "publicPageFetch",
          () =>
            (this.options.fetchPage ?? fetchPublicHtml)(url, {
              signal: this.options.signal,
              timeoutMs: this.options.timeoutMs,
            }),
        );
        this.fetched += 1;
        const children =
          next.depth < 2 ? relatedEventPages(page.url, page.html) : [];
        // Details/map pages are processed before another listing page consumes the budget.
        queue.unshift(
          ...children.map((child) => ({ url: child, depth: next.depth + 1 })),
        );
        const listing = new URL(page.url).pathname.includes("/event_list/");
        try {
          this.extracted.push(
            ...(await extractEventsFromHtml({
              sourceUrl: page.url,
              html: page.html,
              ollama:
                listing && children.length ? undefined : this.options.ollama,
              signal: this.options.signal,
              timings: this.options.timings,
            })),
          );
        } catch {
          this.options.onIssue("ollama_extraction_unavailable");
          this.extracted.push(
            ...(await extractEventsFromHtml({
              sourceUrl: page.url,
              html: page.html,
            })),
          );
        }
      } catch {
        this.options.onIssue(
          this.options.signal.aborted
            ? "event_discovery_timeout"
            : "event_page_unavailable",
        );
      }
    }
    if (this.options.signal.aborted)
      this.options.onIssue("event_discovery_timeout");
    return this.events();
  }

  events() {
    const merged = new Map<string, ExtractedEvent>();
    for (const event of this.extracted) {
      const key = eventIdentity({ ...event, location: event.address });
      const prior = merged.get(key);
      merged.set(
        key,
        prior
          ? {
              ...prior,
              ...event,
              sourceCoordinates:
                event.sourceCoordinates ?? prior.sourceCoordinates,
              coordinateSourceUrl:
                event.coordinateSourceUrl ?? prior.coordinateSourceUrl,
              hoursText: event.hoursText ?? prior.hoursText,
            }
          : event,
      );
    }
    return [...merged.values()];
  }

  counts() {
    return {
      attemptedPages: this.visited.size,
      fetchedPages: this.fetched,
      parsedEvents: this.events().length,
    };
  }
}
