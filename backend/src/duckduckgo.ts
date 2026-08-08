import { load } from "cheerio";

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
  ): Promise<WebSearchResult[]>;
}

export class DuckDuckGoHtmlSearchProvider implements WebSearchProvider {
  constructor(private readonly fetchImplementation: typeof fetch = fetch) {}

  async search(query: string, limit: number, signal?: AbortSignal) {
    const safeQuery = sanitizeSearchTerms(query);
    if (!safeQuery) return [];
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", safeQuery);
    const response = await this.fetchImplementation(url, {
      signal,
      headers: {
        Accept: "text/html",
        "Accept-Language": "ja,en;q=0.7",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 SPOONT/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
    }
    const $ = load(await response.text());
    const results: WebSearchResult[] = [];
    $(".result").each((_, element) => {
      if (results.length >= limit) return false;
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
    return results;
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
