import type { Coordinates } from "./geocoding.js";
import {
  measureSearchTiming,
  type SearchTimingCollector,
} from "./search-timing.js";

export type TravelMode = "TRANSIT" | "WALK";

export type TransitFare = {
  currency: string;
  ticket: number;
  ic: number | null;
};

export type TransitRoute = {
  destinationIndex: number;
  travelMode: TravelMode;
  durationSeconds: number;
  distanceMeters: number;
  fare?: TransitFare | null;
  destinationWalkSeconds?: number;
  nearbyAreaName?: string;
};

type NearbyTransitEndpoint = {
  endpoint: string;
  name: string;
  kind: "station" | "stop";
  latitude: number;
  longitude: number;
  areaName: string;
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
          routes[destinationIndex] = await this.planOne(
            origin,
            destination,
            destinationIndex,
            departureAt,
            signal,
            timings,
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

  async resolveNearbyAreas(
    destinations: Coordinates[],
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ) {
    return Promise.all(
      destinations.map((destination) =>
        measureSearchTiming(
          timings,
          "transitRouting",
          "nearbyStationLookup",
          () => this.resolveNearbyArea(destination, signal),
        ).catch(() => null),
      ),
    );
  }

  private async planOne(
    origin: Coordinates,
    destination: Coordinates,
    destinationIndex: number,
    departureAt: Date,
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ) {
    const nearbyEndpoint = await measureSearchTiming(
      timings,
      "transitRouting",
      "nearbyStationLookup",
      () => this.resolveNearbyTransitEndpoint(destination, signal),
    );
    if (!nearbyEndpoint) return null;

    return measureSearchTiming(
      timings,
      "transitRouting",
      "routePlan",
      async () => {
        const url = new URL("/api/v1/plan", withTrailingSlash(this.baseUrl));
        url.searchParams.set(
          "from",
          `geo:${origin.latitude},${origin.longitude}`,
        );
        url.searchParams.set("to", nearbyEndpoint.endpoint);
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
          throw new TransitApiError(
            `Transit API returned HTTP ${response.status}`,
          );
        }
        const body = (await response.json()) as TransitPlanResponse;
        if (!Array.isArray(body.journeys)) {
          throw new TransitApiError("Transit API returned invalid JSON");
        }
        const fastest = body.journeys
          .filter(
            (journey) =>
              Number.isFinite(journey.durationSecs) &&
              journey.durationSecs >= 0,
          )
          .sort((left, right) => left.durationSecs - right.durationSecs)[0];
        if (!fastest) return null;
        const destinationWalkSeconds = estimateDestinationWalkSeconds(
          nearbyEndpoint,
          destination,
        );
        return {
          destinationIndex,
          travelMode: fastest.legs.some((leg) => leg.kind === "transit")
            ? ("TRANSIT" as const)
            : ("WALK" as const),
          durationSeconds: fastest.durationSecs + destinationWalkSeconds,
          distanceMeters: haversineMeters(origin, destination),
          destinationWalkSeconds,
          nearbyAreaName: nearbyEndpoint.areaName,
          fare: normalizeFare(fastest.fare),
        };
      },
    );
  }

  private async resolveNearbyArea(
    destination: Coordinates,
    signal?: AbortSignal,
  ) {
    const url = new URL(
      "/api/v1/places/reverse",
      withTrailingSlash(this.baseUrl),
    );
    url.searchParams.set("lat", String(destination.latitude));
    url.searchParams.set("lon", String(destination.longitude));
    url.searchParams.set("limit", "10");
    url.searchParams.set("radiusMeters", "500");
    const body = await this.fetchNearbyPlaces(url, signal);
    const ordered = orderTransitPlaces(body.places, true);
    const nearest = ordered[0];
    if (!nearest) return null;
    return formatNearbyArea(nearest.name, nearest.kind);
  }

  private async resolveNearbyTransitEndpoint(
    destination: Coordinates,
    signal?: AbortSignal,
  ): Promise<NearbyTransitEndpoint | null> {
    const url = new URL(
      "/api/v1/places/reverse",
      withTrailingSlash(this.baseUrl),
    );
    url.searchParams.set("lat", String(destination.latitude));
    url.searchParams.set("lon", String(destination.longitude));
    url.searchParams.set("limit", "10");
    url.searchParams.set("radiusMeters", "500");
    const body = await this.fetchNearbyPlaces(url, signal);
    const places = orderTransitPlaces(body.places, false).slice(0, 3);
    const suggestionsByName = new Map<
      string,
      Promise<TransitLocationResponse>
    >();

    for (const place of places) {
      if (isTransitEndpoint(place.endpoint)) {
        return {
          endpoint: place.endpoint,
          name: place.name,
          kind: place.kind,
          latitude: place.latitude,
          longitude: place.longitude,
          areaName: formatNearbyArea(place.name, place.kind),
        };
      }

      let suggestions = suggestionsByName.get(place.name);
      if (!suggestions) {
        const suggestionUrl = new URL(
          "/api/v1/locations/suggest",
          withTrailingSlash(this.baseUrl),
        );
        suggestionUrl.searchParams.set("q", place.name);
        suggestionUrl.searchParams.set("limit", "10");
        suggestions = this.fetchLocationSuggestions(suggestionUrl, signal);
        suggestionsByName.set(place.name, suggestions);
      }
      const body = await suggestions;
      const matched = nearestFeedStation(body.stations, place);
      if (!matched) continue;
      return {
        endpoint: matched.id,
        name: place.name,
        kind: place.kind,
        latitude: matched.latitude,
        longitude: matched.longitude,
        areaName: formatNearbyArea(place.name, place.kind),
      };
    }
    return null;
  }

  private async fetchNearbyPlaces(url: URL, signal?: AbortSignal) {
    const response = await this.fetchImplementation(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new TransitApiError(`Transit API returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as TransitPlacesResponse;
    if (!Array.isArray(body.places)) {
      throw new TransitApiError("Transit API returned invalid place JSON");
    }
    return body;
  }

  private async fetchLocationSuggestions(url: URL, signal?: AbortSignal) {
    const response = await this.fetchImplementation(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new TransitApiError(`Transit API returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as TransitLocationResponse;
    if (!Array.isArray(body.stations)) {
      throw new TransitApiError("Transit API returned invalid station JSON");
    }
    return body;
  }
}

type TransitPlanResponse = {
  journeys?: {
    durationSecs: number;
    legs: { kind: string }[];
    fare?: {
      currency?: unknown;
      ticket?: unknown;
      ic?: unknown;
    };
  }[];
};

type TransitPlacesResponse = {
  places?: TransitPlace[];
};

type TransitPlace = {
  name?: unknown;
  kind?: unknown;
  endpoint?: unknown;
  lat?: unknown;
  lon?: unknown;
  distanceMeters?: unknown;
};

type TransitLocationResponse = {
  stations?: {
    id?: unknown;
    name?: unknown;
    kind?: unknown;
    lat?: unknown;
    lon?: unknown;
  }[];
};

type OrderedTransitPlace = {
  name: string;
  kind: "station" | "stop";
  endpoint: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

type MatchedFeedStation = {
  id: string;
  name: string;
  kind: "station" | "stop";
  latitude: number;
  longitude: number;
};

const MAX_STATION_SUGGESTION_DISTANCE_METERS = 1_500;
const WALKING_SPEED_METERS_PER_SECOND = 1.2;
const WALKING_ROUTE_DETOUR_FACTOR = 1.3;

function orderTransitPlaces(
  places: TransitPlace[] | undefined,
  preferStations: boolean,
): OrderedTransitPlace[] {
  return (places ?? [])
    .filter(
      (
        place,
      ): place is TransitPlace & {
        name: string;
        kind: "station" | "stop";
        lat: number;
        lon: number;
        distanceMeters: number;
      } =>
        (place.kind === "station" || place.kind === "stop") &&
        typeof place.name === "string" &&
        place.name.trim().length > 0 &&
        hasCoordinates(place) &&
        typeof place.distanceMeters === "number" &&
        Number.isFinite(place.distanceMeters) &&
        place.distanceMeters >= 0,
    )
    .map((place) => ({
      name: place.name.trim().slice(0, 100),
      kind: place.kind,
      endpoint:
        typeof place.endpoint === "string" ? place.endpoint.trim() : null,
      latitude: place.lat,
      longitude: place.lon,
      distanceMeters: place.distanceMeters,
    }))
    .sort((left, right) => {
      if (preferStations && left.kind !== right.kind) {
        return left.kind === "station" ? -1 : 1;
      }
      return left.distanceMeters - right.distanceMeters;
    });
}

function nearestFeedStation(
  stations: TransitLocationResponse["stations"],
  place: OrderedTransitPlace,
): MatchedFeedStation | null {
  const candidates = (stations ?? [])
    .filter(
      (
        station,
      ): station is NonNullable<TransitLocationResponse["stations"]>[number] & {
        id: string;
        name: string;
        kind: "station" | "stop";
        lat: number;
        lon: number;
      } =>
        typeof station.id === "string" &&
        isTransitEndpoint(station.id) &&
        typeof station.name === "string" &&
        station.name.trim().length > 0 &&
        (station.kind === "station" || station.kind === "stop") &&
        hasCoordinates(station),
    )
    .map((station) => ({
      id: station.id,
      name: station.name.trim().slice(0, 100),
      kind: station.kind,
      latitude: station.lat,
      longitude: station.lon,
      distanceMeters: haversineMeters(place, {
        latitude: station.lat,
        longitude: station.lon,
      }),
    }))
    .filter(
      (station) =>
        station.distanceMeters <= MAX_STATION_SUGGESTION_DISTANCE_METERS,
    )
    .sort((left, right) => {
      const distanceDifference = left.distanceMeters - right.distanceMeters;
      if (distanceDifference !== 0) return distanceDifference;
      if (left.kind === right.kind) return 0;
      return left.kind === "station" ? -1 : 1;
    });
  return candidates[0] ?? null;
}

function isTransitEndpoint(value: string | null | undefined): value is string {
  return (
    typeof value === "string" && value.length > 0 && !value.startsWith("geo:")
  );
}

function hasCoordinates<T extends { lat?: unknown; lon?: unknown }>(
  value: T,
): value is T & { lat: number; lon: number } {
  return (
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon) &&
    value.lon >= -180 &&
    value.lon <= 180
  );
}

function formatNearbyArea(name: string, kind: "station" | "stop") {
  const normalizedName = name.trim().slice(0, 100);
  return kind === "station"
    ? `${normalizedName.endsWith("駅") ? normalizedName : `${normalizedName}駅`}周辺`
    : `${normalizedName}周辺`;
}

function estimateDestinationWalkSeconds(
  station: Pick<NearbyTransitEndpoint, "latitude" | "longitude">,
  destination: Coordinates,
) {
  const straightLineMeters = haversineMeters(station, destination);
  return Math.ceil(
    (straightLineMeters * WALKING_ROUTE_DETOUR_FACTOR) /
      WALKING_SPEED_METERS_PER_SECOND,
  );
}

function normalizeFare(
  fare: NonNullable<TransitPlanResponse["journeys"]>[number]["fare"],
): TransitFare | null {
  if (
    !fare ||
    typeof fare.currency !== "string" ||
    typeof fare.ticket !== "number" ||
    !Number.isFinite(fare.ticket) ||
    fare.ticket < 0
  ) {
    return null;
  }
  const ic =
    typeof fare.ic === "number" && Number.isFinite(fare.ic) && fare.ic >= 0
      ? fare.ic
      : null;
  return { currency: fare.currency, ticket: fare.ticket, ic };
}

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
