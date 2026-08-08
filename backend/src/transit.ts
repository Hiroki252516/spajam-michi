import type { Coordinates } from "./geocoding.js";
import {
  measureSearchTiming,
  type SearchTimingCollector,
} from "./search-timing.js";

export type TravelMode = "TRANSIT" | "WALK";

export type TransitRoute = {
  destinationIndex: number;
  travelMode: TravelMode;
  durationSeconds: number;
  distanceMeters: number;
};

export class TransitApiError extends Error {}

export class TransitApiClient {
  constructor(
    private readonly baseUrl = "https://api.transit.ls8h.com",
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async computeRoutes(
    origin: Coordinates,
    destinations: Coordinates[],
    departureAt: Date,
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ) {
    if (destinations.length === 0) return [];
    const routes: (TransitRoute | null)[] = Array.from(
      { length: destinations.length },
      () => null,
    );
    let nextIndex = 0;
    let successfulRequests = 0;
    const errors: unknown[] = [];
    const worker = async () => {
      while (nextIndex < destinations.length) {
        const destinationIndex = nextIndex;
        nextIndex += 1;
        const destination = destinations[destinationIndex]!;
        try {
          routes[destinationIndex] = await measureSearchTiming(
            timings,
            "transitRouting",
            "routePlan",
            () =>
              this.planOne(
                origin,
                destination,
                destinationIndex,
                departureAt,
                signal,
              ),
          );
          successfulRequests += 1;
        } catch (error) {
          errors.push(error);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, destinations.length) }, worker),
    );
    if (successfulRequests === 0 && errors.length > 0) {
      const first = errors[0];
      throw first instanceof TransitApiError
        ? first
        : new TransitApiError(
            first instanceof Error ? first.message : "Transit API failed",
          );
    }
    return routes;
  }

  private async planOne(
    origin: Coordinates,
    destination: Coordinates,
    destinationIndex: number,
    departureAt: Date,
    signal?: AbortSignal,
  ) {
    const url = new URL("/api/v1/plan", withTrailingSlash(this.baseUrl));
    url.searchParams.set("from", `geo:${origin.latitude},${origin.longitude}`);
    url.searchParams.set(
      "to",
      `geo:${destination.latitude},${destination.longitude}`,
    );
    url.searchParams.set("date", formatTokyoDate(departureAt));
    url.searchParams.set("time", formatTokyoTime(departureAt));
    url.searchParams.set("type", "departure");
    url.searchParams.set("maxTransfers", "3");
    url.searchParams.set("numItineraries", "3");
    const response = await this.fetchImplementation(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new TransitApiError(`Transit API returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as TransitPlanResponse;
    if (!Array.isArray(body.journeys)) {
      throw new TransitApiError("Transit API returned invalid JSON");
    }
    const fastest = body.journeys
      .filter(
        (journey) =>
          Number.isFinite(journey.durationSecs) && journey.durationSecs >= 0,
      )
      .sort((left, right) => left.durationSecs - right.durationSecs)[0];
    if (!fastest) return null;
    return {
      destinationIndex,
      travelMode: fastest.legs.some((leg) => leg.kind === "transit")
        ? ("TRANSIT" as const)
        : ("WALK" as const),
      durationSeconds: fastest.durationSecs,
      distanceMeters: haversineMeters(origin, destination),
    };
  }
}

type TransitPlanResponse = {
  journeys?: {
    durationSecs: number;
    legs: { kind: string }[];
  }[];
};

function formatTokyoDate(date: Date) {
  return dateParts(date).replaceAll("-", "");
}

function formatTokyoTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dateParts(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function haversineMeters(origin: Coordinates, destination: Coordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
  );
}

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
