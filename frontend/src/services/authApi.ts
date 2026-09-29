import { apiRequest } from './apiClient';

export interface VisitedEventItem {
  id: string;
  eventName: string;
  visitedDate: string;
  rating: number;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarUrl?: string | null;
  visitedEvents: VisitedEventItem[];
  isFirstLogin?: boolean;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

interface BackendUserProfile {
  id: string;
  name: string;
  avatarUrl?: string | null;
  visitedEvents?: Array<{
    id: string;
    spotName?: string;
    eventName?: string;
    visitedDate: string;
    rating: number;
  }>;
}

interface BackendAuthResponse {
  token: string;
  user: BackendUserProfile;
}

const DEMO_CREDENTIALS = {
  email: 'dev@spajam.jp',
  password: 'demo1234',
};

function normalizeAuthResponse(response: BackendAuthResponse): AuthResponse {
  return {
    token: response.token,
    user: {
      id: response.user.id,
      name: response.user.name,
      avatarUrl: response.user.avatarUrl ?? null,
      visitedEvents: (response.user.visitedEvents ?? []).map((event) => ({
        id: event.id,
        eventName: event.eventName ?? event.spotName ?? 'イベント',
        visitedDate: event.visitedDate,
        rating: event.rating,
      })),
      isFirstLogin: false,
    },
  };
}

async function authenticate(email: string, password: string, path: string) {
  const response = await apiRequest<BackendAuthResponse>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return normalizeAuthResponse(response);
}

export const loginApi = async (
  email: string,
  password: string,
): Promise<AuthResponse> => authenticate(email, password, '/api/auth/login');

export const demoLoginApi = async (): Promise<AuthResponse> =>
  authenticate(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password, '/api/auth/login');

export const registerApi = async (
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> => {
  const response = await apiRequest<BackendAuthResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  return normalizeAuthResponse(response);
};

export const logoutApi = async (token: string): Promise<void> => {
  await apiRequest<{ message: string }>('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
};
