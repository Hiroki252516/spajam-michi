import { API_BASE_URL, apiRequest } from './apiClient';

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
  travelMode?: 'TRANSIT' | 'WALK';
  travelDurationMinutes?: number;
  recommendationReason?: string;
}

export interface RevealedEvent {
  id: string;
  name: string;
  description: string;
  detailedDescription: string;
}

export interface EventSearchMetadata {
  source: 'live' | 'cache' | 'database_fallback';
  degradedReasons: string[];
}

export interface EventSearchResponse {
  events: EventData[];
  meta: EventSearchMetadata;
}

interface SearchAccepted {
  jobId: string;
  status: 'queued';
  pollUrl: string;
}

interface SearchJob {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  events?: EventData[];
  meta?: EventSearchMetadata;
  error?: { code?: string; message?: string };
}

interface ReviewResponse {
  reviewId: string;
  eventId: string;
  userId: string;
  rating: number;
  createdAt: string;
  updatedAt?: string;
}

const SEARCH_POLL_INTERVAL_MS = 1_000;
const SEARCH_TIMEOUT_MS = 135_000;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 現在地から実イベントを検索し、非同期検索ジョブの完了まで待つ。
 */
export async function searchEvents(input: {
  token: string;
  latitude: number;
  longitude: number;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<EventSearchResponse> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    q: input.query?.trim() || 'イベント',
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0),
  });
  const accepted = await apiRequest<SearchAccepted>(
    `/api/events/search?${params.toString()}`,
    { headers: { Authorization: `Bearer ${input.token}` } },
  );

  const deadline = Date.now() + SEARCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(SEARCH_POLL_INTERVAL_MS);
    const job = await apiRequest<SearchJob>(accepted.pollUrl, {
      headers: { Authorization: `Bearer ${input.token}` },
    });

    if (job.status === 'succeeded') {
      return {
        events: job.events ?? [],
        meta: job.meta ?? { source: 'database_fallback', degradedReasons: [] },
      };
    }
    if (job.status === 'failed') {
      throw new Error(job.error?.message ?? 'イベント検索に失敗しました。');
    }
  }

  throw new Error('イベント検索に時間がかかっています。少し待ってから再検索してください。');
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
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(coordinates),
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
  return apiRequest<ReviewResponse>('/api/reviews', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ eventId, rating, userId }),
  });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(new URL('/health', `${API_BASE_URL}/`).toString());
    return response.ok;
  } catch {
    return false;
  }
}
