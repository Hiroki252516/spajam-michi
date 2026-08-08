import { z } from "zod";

import type { WebSearchProvider, WebSearchResult } from "./duckduckgo.js";
import { OllamaClient } from "./ollama.js";
import {
  measureSearchTiming,
  type SearchTimingCollector,
} from "./search-timing.js";

export type Coordinates = { latitude: number; longitude: number };

export class LocationResolutionError extends Error {}
export class GsiGeocodingError extends Error {}

const areaSchema = z.object({ area: z.string().min(1).max(80) });
const areaJsonSchema = {
  type: "object",
  required: ["area"],
  properties: { area: { type: "string" } },
} as const;

export class DuckDuckGoCoordinateResolver {
  constructor(
    private readonly webSearch: WebSearchProvider,
    private readonly ollama: OllamaClient,
  ) {}

  async resolve(
    coordinates: Coordinates,
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ) {
    const coordinateQuery = `${coordinates.latitude.toFixed(6)} ${coordinates.longitude.toFixed(6)} 住所 地名`;
    const results = await measureSearchTiming(
      timings,
      "duckDuckGoSearch",
      "currentLocationSearch",
      () => this.webSearch.search(coordinateQuery, 8, signal),
    );
    if (results.length === 0) {
      throw new LocationResolutionError(
        "DuckDuckGo returned no location search results",
      );
    }
    const sourceText = resultsToSourceText(results);
    try {
      const response = await measureSearchTiming(
        timings,
        "gemmaAnalysis",
        "currentLocationExtraction",
        () =>
          this.ollama.json(
            {
              system:
                "DuckDuckGo検索結果に明記されている日本の都道府県と市区町村だけを抽出し、「東京都 千代田区」のように返してください。検索結果に地名が明記されていない場合はareaを空文字にしてください。座標から推測してはいけません。",
              user: sourceText,
              schema: areaJsonSchema,
            },
            areaSchema,
            signal,
          ),
      );
      const area = normalizeArea(response.area);
      if (
        area &&
        isJapanesePrefectureAndMunicipality(area) &&
        sourceContainsArea(sourceText, area)
      ) {
        return area;
      }
    } catch (error) {
      console.warn("Ollama locality extraction unavailable", error);
    }
    const deterministicArea = extractJapaneseLocality(sourceText);
    if (deterministicArea) return deterministicArea;
    throw new LocationResolutionError(
      "DuckDuckGo results did not contain a verifiable locality",
    );
  }
}

export class GsiGeocoder {
  private readonly cache = new Map<string, Coordinates>();

  constructor(private readonly fetchImplementation: typeof fetch = fetch) {}

  async geocode(address: string, signal?: AbortSignal) {
    const normalizedAddress = address
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 300);
    if (!normalizedAddress) throw new GsiGeocodingError("Address is empty");
    const cached = this.cache.get(normalizedAddress);
    if (cached) return cached;
    const url = new URL(
      "https://msearch.gsi.go.jp/address-search/AddressSearch",
    );
    url.searchParams.set("q", normalizedAddress);
    const response = await this.fetchImplementation(url, {
      signal,
      headers: { Accept: "application/json", "Accept-Language": "ja" },
    });
    if (!response.ok) {
      throw new GsiGeocodingError(
        `GSI address search returned HTTP ${response.status}`,
      );
    }
    const body = (await response.json()) as GsiFeature[];
    if (!Array.isArray(body)) {
      throw new GsiGeocodingError("GSI address search returned invalid JSON");
    }
    const coordinates = body.flatMap((feature) => {
      const [longitude, latitude] = feature.geometry?.coordinates ?? [];
      return validJapanCoordinates(latitude, longitude)
        ? [{ latitude: latitude!, longitude: longitude! }]
        : [];
    })[0];
    if (!coordinates) {
      throw new GsiGeocodingError("GSI address search found no coordinates");
    }
    this.cache.set(normalizedAddress, coordinates);
    return coordinates;
  }
}

type GsiFeature = {
  geometry?: { coordinates?: [number, number] };
};

function resultsToSourceText(results: WebSearchResult[]) {
  return results
    .map(
      (result, index) =>
        `${index + 1}. ${result.title}\n${result.snippet}\n${result.url}`,
    )
    .join("\n")
    .slice(0, 12_000);
}

function normalizeArea(value: string) {
  return value
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 80);
}

function sourceContainsArea(source: string, area: string) {
  const compactSource = source.replace(/\s+/gu, "");
  const parts = area.split(/\s+/u).filter(Boolean);
  return (
    parts.length > 0 && parts.every((part) => compactSource.includes(part))
  );
}

function extractJapaneseLocality(source: string) {
  const compactSource = source.replace(/\s+/gu, "");
  const match = JAPANESE_LOCALITY_PATTERN.exec(compactSource);
  return match?.[0] ?? null;
}

function isJapanesePrefectureAndMunicipality(value: string) {
  const compact = value.replace(/\s+/gu, "");
  return new RegExp(`^(?:${JAPANESE_LOCALITY_PATTERN.source})$`, "u").test(
    compact,
  );
}

const JAPANESE_LOCALITY_PATTERN =
  /(?:北海道|東京都|大阪府|京都府|[一-龯]{2,3}県)[一-龯ぁ-んァ-ヶ]{1,12}?(?:市|区|町|村)/u;

function validJapanCoordinates(
  latitude: number | undefined,
  longitude: number | undefined,
) {
  return Boolean(
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude! >= 20 &&
    latitude! <= 46 &&
    longitude! >= 122 &&
    longitude! <= 154,
  );
}
