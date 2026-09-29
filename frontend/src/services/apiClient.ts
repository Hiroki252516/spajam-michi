import Constants from 'expo-constants';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const expoHostUri = Constants.expoConfig?.hostUri;

function getApiBaseUrl() {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '');

  if (expoHostUri) {
    try {
      const host = new URL(`http://${expoHostUri}`).hostname;
      if (host) return `http://${host}:8080`;
    } catch {
      // The explicit API URL below remains available for non-LAN Expo setups.
    }
  }

  return 'http://localhost:8080';
}

export const API_BASE_URL = getApiBaseUrl();

interface ApiEnvelope<T> {
  status: 'success' | 'error';
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, `${API_BASE_URL}/`).toString(), init);
  } catch {
    throw new ApiRequestError(
      `バックエンドに接続できません。API接続先 (${API_BASE_URL}) とMac・iPhoneの同一ネットワーク接続を確認してください。`,
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiRequestError(
      `バックエンドから読み取れない応答が返されました (HTTP ${response.status})。`,
      response.status,
    );
  }

  if (!response.ok || envelope.status === 'error') {
    throw new ApiRequestError(
      envelope.error?.message ?? `バックエンドでエラーが発生しました (HTTP ${response.status})。`,
      response.status,
      envelope.error?.code,
    );
  }

  if (envelope.data === undefined) {
    throw new ApiRequestError('バックエンド応答にデータがありません。', response.status);
  }

  return envelope.data;
}
