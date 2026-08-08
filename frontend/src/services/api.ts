import { DUMMY_EVENTS } from '../constants/dummyData';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface EventData {
  id: string;
  name: string;
  spotName?: string;
  date: string;
  time: string;
  duration?: string;
  cost?: string;
  location: string;
  distance?: string;
  imageUri?: string;
  description?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

interface EventSearchResponse {
  events: EventData[];
  total: number;
  limit: number;
  offset: number;
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
 * イベント一覧取得（バックエンド接続時は実データ、未接続時はダミーデータにフォールバック）
 */
export const fetchEvents = async (
  limit: number = 20,
  offset: number = 0
): Promise<EventData[]> => {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const response = await fetch(
      `${API_BASE_URL}/api/events?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ApiResponse<EventSearchResponse> = await response.json();

    if (data.status === 'error') {
      throw new Error(data.error?.message || 'Unknown error');
    }

    return data.data?.events || [];
  } catch (error) {
    console.warn('Backend API fetch failed, falling back to dummy events:', error);
    return DUMMY_EVENTS as EventData[];
  }
};

/**
 * イベント検索（互換性保持用）
 */
export const searchEvents = async (
  limit: number = 20,
  offset: number = 0
): Promise<EventData[]> => {
  return fetchEvents(limit, offset);
};

/**
 * イベント詳細取得
 */
export const getEventDetail = async (eventId: string): Promise<EventData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ApiResponse<EventData> = await response.json();

    if (data.status === 'error') {
      throw new Error(data.error?.message || 'Unknown error');
    }

    return data.data || ({} as EventData);
  } catch (error) {
    console.error('Error fetching event detail:', error);
    throw error;
  }
};

/**
 * レビュー投稿
 */
export const submitReview = async (
  eventId: string,
  rating: number,
  userId: string = 'anonymous'
): Promise<ReviewResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventId,
        rating,
        userId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ApiResponse<ReviewResponse> = await response.json();

    if (data.status === 'error') {
      throw new Error(data.error?.message || 'Unknown error');
    }

    return data.data || ({} as ReviewResponse);
  } catch (error) {
    console.error('Error submitting review:', error);
    throw error;
  }
};

/**
 * ヘルスチェック
 */
export const checkHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);

    return response.ok;
  } catch (error) {
    console.warn('Health check failed:', error);
    return false;
  }
};

/**
 * デバッグ用: ダミーデータをリセット（開発環境のみ）
 */
export const resetDummyData = async (): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dev/reset`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('Dummy data reset successfully');
  } catch (error) {
    console.warn('Error resetting dummy data:', error);
  }
};
