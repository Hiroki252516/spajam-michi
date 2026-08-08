/**
 * ダミーイベントデータ
 * バックエンド実装前のテスト用データ
 */

export const DUMMY_EVENTS = [
  {
    id: '1',
    name: 'SPAJAM 2026 オープニングセレモニー',
    date: '2026/08/08',
    time: '09:00-09:30',
    location: '東京都渋谷区',
    distance: '1.2 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Opening+Ceremony',
    rating: 4.5,
    description: 'SPAJAMのオープニングセレモニーです。全参加者が集まります。',
    coordinates: {
      latitude: 35.6595,
      longitude: 139.7004,
    },
  },
  {
    id: '2',
    name: 'React Native ワークショップ',
    date: '2026/08/08',
    time: '10:00-11:30',
    location: '東京都渋谷区（ワークショップ会場A）',
    distance: '2.1 km',
    imageUri: 'https://via.placeholder.com/400x150?text=React+Native',
    rating: 4.2,
    description: 'React Nativeを使ったモバイル開発の基礎をお学びいただけます。',
    coordinates: {
      latitude: 35.6612,
      longitude: 139.7017,
    },
  },
  {
    id: '3',
    name: 'デザインシステム構築のベストプラクティス',
    date: '2026/08/08',
    time: '11:45-13:00',
    location: '東京都渋谷区（セミナールームB）',
    distance: '3.0 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Design+System',
    rating: 4.8,
    description: 'スケーラブルなデザインシステムの設計方法について学びます。',
    coordinates: {
      latitude: 35.6634,
      longitude: 139.7045,
    },
  },
  {
    id: '4',
    name: 'ハッカソンメインラウンド',
    date: '2026/08/08',
    time: '14:00-18:00',
    location: '東京都渋谷区（メイン会場）',
    distance: '0.8 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Hackathon',
    rating: 5.0,
    description: 'チームで協力して、革新的なアプリケーションを開発します。',
    coordinates: {
      latitude: 35.6575,
      longitude: 139.6990,
    },
  },
  {
    id: '5',
    name: 'スターアップピッチセッション',
    date: '2026/08/08',
    time: '19:00-20:30',
    location: '東京都渋谷区（ピッチ会場C）',
    distance: '2.5 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Pitch+Session',
    rating: 4.6,
    description: 'ハッカソン参加者による成果発表・ピッチセッション。',
    coordinates: {
      latitude: 35.6556,
      longitude: 139.7065,
    },
  },
];

/**
 * ダミーイベント検索結果
 * searchQuery（検索キーワード）に基づいてフィルタされたイベント
 */
export const searchEvents = (query: string) => {
  if (!query.trim()) {
    return DUMMY_EVENTS;
  }

  const lowerQuery = query.toLowerCase();
  return DUMMY_EVENTS.filter(
    (event) =>
      event.name.toLowerCase().includes(lowerQuery) ||
      event.description.toLowerCase().includes(lowerQuery) ||
      event.location.toLowerCase().includes(lowerQuery)
  );
};

/**
 * イベント詳細取得（IDから）
 */
export const getEventById = (id: string) => {
  return DUMMY_EVENTS.find((event) => event.id === id);
};
