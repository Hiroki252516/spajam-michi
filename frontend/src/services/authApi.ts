/**
 * 認証 API サービス
 * API-REQUIREMENTS-LOGIN.md に定義されたエンドポイントとの通信ラッパー
 */

export interface VisitedEventItem {
  id: string;
  eventName: string;
  visitedDate: string; // 例: "2026年8月2日"
  rating: number;      // 5段階評価 (1〜5)
}

export interface UserProfile {
  id: string;
  name: string;
  avatarUrl?: string | null;
  visitedEvents: VisitedEventItem[];
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

const DUMMY_VISITED_EVENTS: VisitedEventItem[] = [
  {
    id: 'visited_1',
    eventName: 'SPAJAM 2026 予選ハッカソン',
    visitedDate: '2026年8月2日',
    rating: 5,
  },
  {
    id: 'visited_2',
    eventName: 'ナイトマーケット＆フードフェス 2026',
    visitedDate: '2026年7月20日',
    rating: 4,
  },
];

const DUMMY_USER: UserProfile = {
  id: 'usr_spajam2026',
  name: '山田 太郎',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
  visitedEvents: DUMMY_VISITED_EVENTS,
};

/**
 * ログイン API 通信 (モック実装)
 */
export const loginApi = async (email: string, password?: string): Promise<AuthResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  if (!email || !email.includes('@')) {
    throw new Error('有効なメールアドレスを入力してください');
  }

  if (password && password.length < 4) {
    throw new Error('パスワードは4文字以上で入力してください');
  }

  return {
    token: 'mock_jwt_token_spajam_2026',
    user: {
      ...DUMMY_USER,
      name: email.split('@')[0] || DUMMY_USER.name,
    },
  };
};

/**
 * 新規ユーザー登録 API 通信 (モック実装)
 */
export const registerApi = async (
  name: string,
  email: string,
  password?: string
): Promise<AuthResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  if (!name.trim()) {
    throw new Error('お名前を入力してください');
  }

  if (!email || !email.includes('@')) {
    throw new Error('有効なメールアドレスを入力してください');
  }

  if (password && password.length < 4) {
    throw new Error('パスワードは4文字以上で入力してください');
  }

  return {
    token: 'mock_jwt_token_spajam_2026_new',
    user: {
      id: `usr_${Date.now()}`,
      name,
      avatarUrl: null,
      visitedEvents: [],
    },
  };
};

/**
 * ログアウト API 通信
 */
export const logoutApi = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
};
