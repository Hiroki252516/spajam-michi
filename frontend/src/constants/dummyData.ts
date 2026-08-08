/**
 * ダミーイベントデータ
 * バックエンド実装前のテスト用データ
 */

export interface DummyEvent {
  id: string;
  name: string;
  spotName: string;
  date: string;
  time: string;
  duration: string;
  cost: string;
  location: string;
  distance: string;
  imageUri?: string;
  description: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export const DUMMY_EVENTS: DummyEvent[] = [
  {
    id: '1',
    name: 'SPAJAM 2026 オープニングセレモニー',
    spotName: '渋谷・特設屋外ステージエリア',
    date: '2026/08/08',
    time: '09:00-09:30',
    duration: '約30分',
    cost: '無料',
    location: '東京都渋谷区神南1-1',
    distance: '1.2 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Mystery+Spot+1',
    description: '熱気あふれるオープニングセッションが開催されているおすすめのスポットです。',
    coordinates: {
      latitude: 35.6595,
      longitude: 139.7004,
    },
  },
  {
    id: '2',
    name: 'React Native ワークショップ',
    spotName: '渋谷・クリエイティブ体験スペース',
    date: '2026/08/08',
    time: '10:00-11:30',
    duration: '約90分',
    cost: '1,000円',
    location: '東京都渋谷区道玄坂2-2',
    distance: '2.1 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Mystery+Spot+2',
    description: '最新テクノロジーのハンズオン体験が楽しめる人気スポットです。',
    coordinates: {
      latitude: 35.6612,
      longitude: 139.7017,
    },
  },
  {
    id: '3',
    name: 'デザインシステム構築のベストプラクティス',
    spotName: '渋谷・デザインカンファレンスサロン',
    date: '2026/08/08',
    time: '11:45-13:00',
    duration: '約75分',
    cost: '1,500円',
    location: '東京都渋谷区桜丘町3-3',
    distance: '3.0 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Mystery+Spot+3',
    description: '洗練されたデザイン思考を深める特別なセミナーが開催されています。',
    coordinates: {
      latitude: 35.6634,
      longitude: 139.7045,
    },
  },
  {
    id: '4',
    name: 'ハッカソンメインラウンド',
    spotName: '渋谷・秘密のイノベーションハブ',
    date: '2026/08/08',
    time: '14:00-18:00',
    duration: '約4時間',
    cost: '無料',
    location: '東京都渋谷区宇田川町4-4',
    distance: '0.8 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Mystery+Spot+4',
    description: 'チーム開発の熱気とアイデアが交差するハッカソンメイン会場。',
    coordinates: {
      latitude: 35.6575,
      longitude: 139.6990,
    },
  },
  {
    id: '5',
    name: 'スターアップピッチセッション',
    spotName: '渋谷・ナイトピッチ＆交流ラウンジ',
    date: '2026/08/08',
    time: '19:00-20:30',
    duration: '約90分',
    cost: '2,000円 (1ドリンク付)',
    location: '東京都渋谷区渋谷1-5',
    distance: '2.5 km',
    imageUri: 'https://via.placeholder.com/400x150?text=Mystery+Spot+5',
    description: '新進気鋭の起業家たちがアイデアを披露するピッチイベント会場。',
    coordinates: {
      latitude: 35.6556,
      longitude: 139.7065,
    },
  },
];

/**
 * ダミーイベント検索結果
 */
export const searchEvents = (query: string) => {
  if (!query.trim()) {
    return DUMMY_EVENTS;
  }

  const lowerQuery = query.toLowerCase();
  return DUMMY_EVENTS.filter(
    (event) =>
      event.spotName.toLowerCase().includes(lowerQuery) ||
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
