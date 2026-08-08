# API-REQUIREMENTS.md

LED QUATTRO フロントエンド → バックエンド API仕様書

**作成日**: 2026-08-08  
**対象**: SPAJAM 2026 LED Quattro プロジェクト  
**フロントエンド**: React Native + Expo

---

## 概要

フロントエンド（React Native）が必要とするバックエンド API エンドポイント一覧。
イベント検索→ナビゲーション→レビュー投稿 の3画面フローに対応したデータ構造。

---

## ベースURL

```
http://localhost:8080
```

本番環境では環境変数 `EXPO_PUBLIC_API_URL` で指定。

---

## 1. イベント検索 API

### エンドポイント

```
GET /api/events/search?q={query}
```

### リクエスト

| パラメータ | 型     | 必須 | 説明                  |
|-----------|--------|------|-------------------|
| q         | string | ○   | 検索キーワード（イベント名・場所等） |
| limit     | number | ×   | 取得件数（デフォルト: 20） |
| offset    | number | ×   | オフセット（ページネーション） |

### レスポンス

**ステータス: 200 OK**

```json
{
  "status": "success",
  "data": {
    "events": [
      {
        "id": "1",
        "name": "SPAJAM 2026 オープニングセレモニー",
        "date": "2026/08/08",
        "time": "09:00-09:30",
        "location": "東京都渋谷区",
        "distance": "1.2 km",
        "imageUri": "https://example.com/images/event-1.jpg",
        "rating": 4.5,
        "description": "SPAJAMのオープニングセレモニーです。全参加者が集まります。",
        "coordinates": {
          "latitude": 35.6595,
          "longitude": 139.7004
        }
      },
      {
        "id": "2",
        "name": "React Native ワークショップ",
        "date": "2026/08/08",
        "time": "10:00-11:30",
        "location": "東京都渋谷区（ワークショップ会場A）",
        "distance": "2.1 km",
        "imageUri": "https://example.com/images/event-2.jpg",
        "rating": 4.2,
        "description": "React Nativeを使ったモバイル開発の基礎をお学びいただけます。",
        "coordinates": {
          "latitude": 35.6612,
          "longitude": 139.7017
        }
      }
    ],
    "total": 10,
    "limit": 20,
    "offset": 0
  }
}
```

### エラーレスポンス

**ステータス: 400 Bad Request**

```json
{
  "status": "error",
  "error": {
    "code": "INVALID_QUERY",
    "message": "検索キーワードが入力されていません"
  }
}
```

---

## 2. イベント詳細 API

### エンドポイント

```
GET /api/events/{eventId}
```

### リクエスト

| パラメータ | 型     | 必須 | 説明           |
|-----------|--------|------|--------------|
| eventId   | string | ○   | パスパラメータ |

### レスポンス

**ステータス: 200 OK**

```json
{
  "status": "success",
  "data": {
    "id": "1",
    "name": "SPAJAM 2026 オープニングセレモニー",
    "date": "2026/08/08",
    "time": "09:00-09:30",
    "location": "東京都渋谷区",
    "imageUri": "https://example.com/images/event-1.jpg",
    "rating": 4.5,
    "reviewCount": 127,
    "description": "SPAJAMのオープニングセレモニーです。全参加者が集まります。",
    "detailedDescription": "このセレモニーでは、主催者からのウェルカムスピーチと...（省略）",
    "coordinates": {
      "latitude": 35.6595,
      "longitude": 139.7004
    },
    "tags": ["ハッカソン", "開幕", "全参加者向け"],
    "organizer": {
      "name": "SPAJAM運営事務局",
      "contactEmail": "info@example.com"
    }
  }
}
```

### エラーレスポンス

**ステータス: 404 Not Found**

```json
{
  "status": "error",
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "指定されたイベントが見つかりません"
  }
}
```

---

## 3. レビュー投稿 API

### エンドポイント

```
POST /api/reviews
```

### リクエストボディ

```json
{
  "eventId": "1",
  "rating": 5,
  "comment": "素晴らしいイベントでした！",
  "userId": "user-123"
}
```

| フィールド | 型     | 必須 | 説明                     |
|-----------|--------|------|------------------------|
| eventId   | string | ○   | イベントID              |
| rating    | number | ○   | 5段階評価（1-5）         |
| comment   | string | ×   | レビューコメント（最大500文字） |
| userId    | string | ○   | ユーザーID              |

### レスポンス

**ステータス: 201 Created**

```json
{
  "status": "success",
  "data": {
    "reviewId": "review-456",
    "eventId": "1",
    "userId": "user-123",
    "rating": 5,
    "comment": "素晴らしいイベントでした！",
    "createdAt": "2026-08-08T14:30:00Z",
    "updatedAt": "2026-08-08T14:30:00Z"
  }
}
```

### エラーレスポンス

**ステータス: 400 Bad Request**

```json
{
  "status": "error",
  "error": {
    "code": "INVALID_RATING",
    "message": "評価は1〜5の整数である必要があります"
  }
}
```

**ステータス: 409 Conflict**

```json
{
  "status": "error",
  "error": {
    "code": "DUPLICATE_REVIEW",
    "message": "このユーザーはすでにこのイベントをレビュー済みです"
  }
}
```

---

## 4. ユーザー認証・ユーザー情報 API（オプション・検討中）

### エンドポイント

```
POST /api/auth/login
GET /api/users/me
```

**仕様は後で協議予定**

---

## 5. データベーススキーマ提案

### events テーブル

```sql
CREATE TABLE events (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  date VARCHAR(20) NOT NULL,
  time VARCHAR(20) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT,
  detailed_description TEXT,
  image_uri VARCHAR(500),
  rating DECIMAL(3, 1) DEFAULT 0.0,
  review_count INT DEFAULT 0,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  organizer_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### reviews テーブル

```sql
CREATE TABLE reviews (
  id VARCHAR(50) PRIMARY KEY,
  event_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY unique_event_user (event_id, user_id)
);
```

### users テーブル

```sql
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### event_tags テーブル

```sql
CREATE TABLE event_tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(50) NOT NULL,
  tag VARCHAR(100) NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  UNIQUE KEY unique_event_tag (event_id, tag)
);
```

---

## 6. 実装上の注意事項

### GPS位置情報による到着判定

**フロントエンド側**:
- `expo-location` でユーザーの現在地を取得
- イベント座標との距離を Haversine 公式で計算
- **100m以内** で「到着」と判定

**バックエンド側**:
- イベントの座標（latitude, longitude）を正確に登録
- 複数のイベント会場がある場合は、各会場の座標を登録

### レーティング計算

```
平均評価 = Σ(rating) / COUNT(reviews)
```

定期的に `events.rating` を更新する。

### デバッグ用ダミーイベントデータ

以下のイベントをDB初期化時に自動挿入すると、テスト・開発が容易:

```sql
INSERT INTO events (id, name, date, time, location, latitude, longitude, description) VALUES
('1', 'SPAJAM 2026 オープニングセレモニー', '2026/08/08', '09:00-09:30', '東京都渋谷区', 35.6595, 139.7004, '...'),
('2', 'React Native ワークショップ', '2026/08/08', '10:00-11:30', '東京都渋谷区（ワークショップ会場A）', 35.6612, 139.7017, '...'),
...
```

---

## 7. エラーハンドリング

### 共通エラーコード

| コード | ステータス | 説明 |
|------|---------|------|
| INTERNAL_SERVER_ERROR | 500 | サーバーエラー |
| INVALID_REQUEST | 400 | リクエスト形式が不正 |
| NOT_FOUND | 404 | リソースが見つからない |
| UNAUTHORIZED | 401 | 認証が必要 |
| FORBIDDEN | 403 | アクセス権限がない |
| CONFLICT | 409 | リソースの競合 |

### レスポンス形式（エラー時）

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーの詳細説明",
    "details": {}
  }
}
```

---

## 8. レート制限・パフォーマンス

### 推奨設定

- API リクエスト制限: **100リクエスト/分 (IP単位)**
- レスポンスタイムアウト: **10秒**
- 検索結果の最大件数: **100件**

### キャッシング

- イベント情報: **5分間キャッシュ**
- 検索結果: **2分間キャッシュ**
- ユーザー情報: **セッション中キャッシュ**

---

## 9. テスト用エンドポイント

### ヘルスチェック

```
GET /health
```

レスポンス:

```json
{
  "status": "ok",
  "timestamp": "2026-08-08T14:30:00Z",
  "version": "1.0.0"
}
```

### ダミーデータリセット

```
POST /api/dev/reset
```

（開発環境のみ使用可能）

---

## 10. 実装予定

| 機能 | 優先度 | 実装予定時期 |
|------|--------|----------|
| イベント検索・一覧 | 🔴 高 | Week 1 |
| イベント詳細取得 | 🔴 高 | Week 1 |
| レビュー投稿 | 🟠 中 | Week 1 |
| ユーザー認証 | 🟡 低 | Week 2（オプション） |
| GPS連携テスト用エンドポイント | 🟠 中 | Week 1 |

---

## 11. 質問・お問い合わせ

フロントエンド実装時に不明な点や追加要件がありましたら、プロジェクトSlackチャネルに連絡してください。

**連絡先**: frontendチャネル or ユーザー名: [@frontend-lead]

---

**ドキュメント作成者**: フロントエンドチーム  
**最終更新**: 2026-08-08
