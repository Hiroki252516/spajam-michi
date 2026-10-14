import { load } from "cheerio";
import { setTimeout as delay } from "node:timers/promises";

export class WebSearchError extends Error {
  constructor(
    readonly reason:
      | "duckduckgo_blocked"
      | "duckduckgo_invalid_response"
      | "duckduckgo_unavailable",
  ) {
    super(reason);
  }
}

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export interface WebSearchProvider {
  search(
    query: string,
    limit: number,
    signal?: AbortSignal,
    onIssue?: (reason: string) => void,
  ): Promise<WebSearchResult[]>;
}

export class DuckDuckGoHtmlSearchProvider implements WebSearchProvider {
  constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly retryDelay: (signal?: AbortSignal) => Promise<unknown> = (
      signal,
    ) => delay(400, undefined, { signal }),
  ) {}

  async search(
    query: string,
    limit: number,
    signal?: AbortSignal,
    onIssue?: (reason: string) => void,
  ) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.searchOnce(query, limit, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        const failure =
          error instanceof WebSearchError
            ? error
            : new WebSearchError("duckduckgo_unavailable");
        onIssue?.(failure.reason);
        if (attempt === 1) throw failure;
        await this.retryDelay(signal);
      }
    }
    return [];
  }

  private async searchOnce(query: string, limit: number, signal?: AbortSignal) {
    const safeQuery = sanitizeSearchTerms(query);
    if (!safeQuery) return [];
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", safeQuery);
    const response = await this.fetchImplementation(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
        : AbortSignal.timeout(8_000),
      headers: {
        Accept: "text/html",
        "Accept-Language": "ja,en;q=0.7",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 SPOONT/1.0",
      },
    });
    if (!response.ok) {
      throw new WebSearchError(
        response.status === 403 || response.status === 429
          ? "duckduckgo_blocked"
          : "duckduckgo_unavailable",
      );
    }
    const $ = load(await response.text());
    if (
      $(".anomaly-modal, #challenge-form, #anomaly-form").length ||
      /Unfortunately, bots|Please complete the following challenge/iu.test(
        $("body").text(),
      )
    ) {
      throw new WebSearchError("duckduckgo_blocked");
    }
    const results: WebSearchResult[] = [];
    $(".result").each((_, element) => {
      const anchor = $(element).find(".result__a").first();
      const href = anchor.attr("href");
      const resolvedUrl = href ? resolveDuckDuckGoUrl(href) : null;
      if (!resolvedUrl) return;
      results.push({
        title: anchor.text().trim(),
        url: resolvedUrl,
        snippet: $(element).find(".result__snippet").text().trim(),
      });
    });
    if (
      results.length === 0 &&
      !$(".no-results, .result--no-result").length &&
      !/No (?:more )?(?:search )?results(?: found)?/iu.test($("body").text())
    ) {
      throw new WebSearchError("duckduckgo_invalid_response");
    }
    return [
      ...new Map(results.map((result) => [result.url, result])).values(),
    ].slice(0, limit);
  }
}

export function sanitizeSearchTerms(value: string) {
  return value
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, " ")
    .replace(/(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/gu, " ")
    .replace(/-?\d{2,3}\.\d{4,}\s*[,/]\s*-?\d{2,3}\.\d{4,}/gu, " ")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 160);
}

function resolveDuckDuckGoUrl(value: string) {
  try {
    const url = new URL(value, "https://html.duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    const resolved = redirected ? new URL(redirected) : url;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    if (resolved.hostname.endsWith("duckduckgo.com")) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}
