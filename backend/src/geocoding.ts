import {
  isDetailedAddress,
  normalizeAddress,
  validVenueCoordinates,
} from "./event-quality.js";

export type Coordinates = { latitude: number; longitude: number };
export class GsiGeocodingError extends Error {}

export class GsiGeocoder {
  private readonly cache = new Map<string, Coordinates>();
  constructor(private readonly fetchImplementation: typeof fetch = fetch) {}

  async geocode(address: string, signal?: AbortSignal) {
    const normalizedAddress = normalizeAddress(address).slice(0, 300);
    if (!isDetailedAddress(normalizedAddress))
      throw new GsiGeocodingError("Venue street address is not verified");
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
    if (!response.ok)
      throw new GsiGeocodingError(
        `GSI address search returned HTTP ${response.status}`,
      );
    const body = (await response.json()) as GsiFeature[];
    if (!Array.isArray(body))
      throw new GsiGeocodingError("GSI address search returned invalid JSON");
    const requestedKey = addressKey(normalizedAddress);
    const candidate = body.find((feature) => {
      const title = feature.properties?.title;
      const [longitude, latitude] = feature.geometry?.coordinates ?? [];
      return (
        typeof title === "string" &&
        isDetailedAddress(title) &&
        /(?:[0-9０-９一二三四五六七八九十]+番|[0-9０-９]+[-－][0-9０-９]+)/u.test(
          title,
        ) &&
        (requestedKey === addressKey(title) ||
          requestedKey.startsWith(`${addressKey(title)}-`)) &&
        validVenueCoordinates(latitude, longitude)
      );
    });
    if (!candidate)
      throw new GsiGeocodingError(
        "GSI returned no matching venue street/block coordinates",
      );
    const [longitude, latitude] = candidate.geometry!.coordinates!;
    const coordinates = { latitude, longitude };
    this.cache.set(normalizedAddress, coordinates);
    return coordinates;
  }
}

type GsiFeature = {
  properties?: { title?: string };
  geometry?: { coordinates?: [number, number] };
};

function addressKey(value: string) {
  return normalizeAddress(value)
    .replace(/[一二三四五六七八九十]+(?=丁目|番|号)/gu, (text) => {
      const digits = "〇一二三四五六七八九";
      if (!text.includes("十")) return String(digits.indexOf(text));
      const [tens, ones] = text.split("十");
      return String(
        (tens ? digits.indexOf(tens) : 1) * 10 +
          (ones ? digits.indexOf(ones) : 0),
      );
    })
    .replace(/丁目|番地?|号|の/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/-$/u, "");
}
