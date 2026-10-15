import { API_BASE_URL, apiRequest } from "./apiClient";
import { pollSearchJob, type SearchJob, type SearchUpdate } from "./searchJob";

export interface EventData {
  id: string;
  name?: string;
  spotName?: string;
  date: string;
  time: string;
  duration?: string;
  cost?: string;
  location: string;
  distance?: string;
  imageUri?: string | null;
  description?: string;
  detailedDescription?: string;
  rating?: number;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  sourceUrl?: string | null;
  travelMode?: "TRANSIT" | "WALK";
  travelDurationMinutes?: number;
  recommendationReason?: string;
  routeCached?: boolean;
  routeCalculatedAt?: string;
}

export interface RevealedEvent {
  id: string;
  name: string;
  description: string;
  detailedDescription: string;
  arrivalMode?: "gps" | "demo";
}

export interface EventSearchMetadata {
  source: "live" | "cache" | "database_fallback";
  degradedReasons: string[];
}

export interface EventSearchResponse {
  events: EventData[];
  meta: EventSearchMetadata;
}

interface SearchAccepted {
  jobId: string;
  status: "queued";
  pollUrl: string;
}

interface ReviewResponse {
  reviewId: string;
  eventId: string;
  userId: string;
  rating: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 現在地から実イベントを検索し、非同期検索ジョブの完了まで待つ。
 */
export async function searchEvents(input: {
  token: string;
  latitude: number;
  longitude: number;
  area: string;
  query?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  onProgress?: (update: SearchUpdate) => void;
}): Promise<EventSearchResponse> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    area: input.area,
    q: input.query?.trim() || "イベント",
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0),
  });
  return pollSearchJob({
    signal: input.signal,
    onProgress: input.onProgress,
    start: (signal) =>
      apiRequest<SearchAccepted>(`/api/events/search?${params.toString()}`, {
        signal,
        headers: { Authorization: `Bearer ${input.token}` },
      }),
    read: (url, signal) =>
      apiRequest<SearchJob>(url, {
        signal,
        headers: { Authorization: `Bearer ${input.token}` },
      }),
  });
}

/**
 * 目的地まで100m以内に到着したことをサーバーで確認し、イベント名を取得する。
 */
export function revealEvent(
  eventId: string,
  token: string,
  coordinates: { latitude: number; longitude: number },
): Promise<RevealedEvent> {
  return apiRequest<RevealedEvent>(
    `/api/events/${encodeURIComponent(eventId)}/reveal`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(coordinates),
    },
  );
}

/** デモアカウントで到着を体験し、選択した実イベントの名前を取得する。 */
export function revealDemoEvent(
  eventId: string,
  token: string,
): Promise<RevealedEvent> {
  return apiRequest<RevealedEvent>(
    `/api/events/${encodeURIComponent(eventId)}/demo-reveal`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

/**
 * 満足度をバックエンドに保存する。
 */
export function submitReview(
  eventId: string,
  rating: number,
  userId: string,
  token: string,
): Promise<ReviewResponse> {
  return apiRequest<ReviewResponse>("/api/reviews", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventId, rating, userId }),
  });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(
      new URL("/health", `${API_BASE_URL}/`).toString(),
    );
    return response.ok;
  } catch {
    return false;
  }
}
