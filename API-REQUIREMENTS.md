# API-REQUIREMENTS.md

# LED QUATTRO フロントエンド → バックエンド 全統合 API仕様書

**最終更新**: 2026-08-08  
**対象**: SPAJAM 2026 LED Quattro プロジェクト  
**フロントエンド**: React Native + Expo (iOS / Android / Web)  
**ドキュメント概要**: バックエンド担当者が本ドキュメント1枚を参照するだけで、フロントエンドに必要な全APIエンドポイント、データ構造、認証、および最新UI要件変更点を完全に把握できる仕様書です。

---

## 📌 直近のUI変更に伴う要件訂正（重要）

バックエンド担当者様は、以下の**フロントエンド仕様変更・削除項目**に留意して開発を行ってください。

| 項目 | 以前の仕様 | 最新の仕様（変更後） | バックエンド影響 |
|---|---|---|---|
| **イベントカード** | 「現地でイベント判明！」赤バッジ表示 | 赤バッジ廃止。開催場所周辺の**地図 (MapView)** を表示 | イベントオブジェクトの **`coordinates` (latitude/longitude)** が**必須化** |
| **カード評価** | 星評価数値 (`rating`: 4.5等) の表示 | **星評価数値 (rating) を削除・廃止** | イベント取得レスポンスにおける **`rating` カラムの返却は不要** |
| **検索フォーム** | キーワード検索バーでイベント絞り込み | **検索フォームを削除** | キーワード検索 `q` パラメータは**不要**（一覧取得 `GET /api/events`） |
| **引っ張り更新** | なし | 画面上部を下スワイプ（**Pull-to-Refresh**）で最新一覧リロード | **`GET /api/events`** がリロード毎に呼び出されるため高速応答が推奨 |
| **初回ログイン** | 常にイベント一覧を表示 | **初回ログイン直後のみチュートリアル（ガイド）を自動表示** | `user` オブジェクトに **`isFirstLogin: boolean`**（または `hasSeenTutorial: boolean`）の返却を推奨 |
| **満足度記録** | 満足度(星) ＋ **体験ログ・メモ(テキスト)** | **体験ログ・メモを削除** (星評価のみ) | `POST /api/reviews` の **`comment` フィールドは不要化** |
| **ドキュメント** | `API-REQUIREMENTS-LOGIN.md` 別途参照 | **本ドキュメント1枚に完全統合** | `API-REQUIREMENTS-LOGIN.md` の閲覧・参照は不要 |

---

## 1. 共通仕様・認証方式

- **ベースURL**: `http://localhost:8080` （環境変数 `EXPO_PUBLIC_API_URL` で設定）
- **データ形式**: `application/json`
- **認証方式**: JWT (JSON Web Token) Bearer 認証
  - ログイン/新規登録成功時に返却される `token` (AccessToken) を HTTP ヘッダーに付与。
  - Header 形式: `Authorization: Bearer <AccessToken>`

---

## 2. API エンドポイント一覧

| 機能 | メソッド | エンドポイント | 認証 | 概要 |
|---|---|---|---|---|
| **イベント一覧取得** | `GET` | `/api/events` | 不要 | イベント一覧取得（初回ロード ＆ 引っ張り更新リロード共用） |
| **イベント詳細取得** | `GET` | `/api/events/{eventId}` | 不要 | イベント詳細情報取得 |
| **満足度記録投稿** | `POST` | `/api/reviews` | 必要 | 星5段階評価（1〜5）の記録 |
| **ログイン** | `POST` | `/api/auth/login` | 不要 | メールアドレス・パスワード認証 |
| **新規ユーザー登録** | `POST` | `/api/auth/register` | 不要 | 新規アカウント作成 |
| **ユーザー情報・マイページ** | `GET` | `/api/auth/me` | 必要 | プロフィール ＆ 参加イベント一覧取得 |
| **ログアウト** | `POST` | `/api/auth/logout` | 必要 | トークン/セッションの無効化 |
| **ヘルスチェック** | `GET` | `/health` | 不要 | サーバー稼働状態の確認 |
| **ダミーデータリセット** | `POST` | `/api/dev/reset` | 不要 | テスト用初期データリセット（開発環境専用） |

---

## 3. エンドポイント詳細仕様

### 3.1. イベント一覧取得 API (`GET /api/events`)

トップページのイベントカード一覧で使用します。  
※初回画面読み込み時および**画面一番上を下にスワイプ（Pull-to-Refresh）した際のリロード**時に呼び出されます。最新のイベント一覧データ（各イベントの緯度経度座標 `coordinates` を含む）を高速に返却してください。

#### リクエストパラメータ（任意・オプション）
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `limit` | `number` | No | 取得件数（デフォルト: 20） |
| `offset` | `number` | No | ページネーションオフセット |

#### レスポンス (200 OK)
```json
{
  "status": "success",
  "data": {
    "events": [
      {
        "id": "1",
        "name": "SPAJAM 2026 オープニングセレモニー",
        "spotName": "渋谷・特設屋外ステージエリア",
        "date": "2026/08/08",
        "time": "09:00-09:30",
        "duration": "約30分",
        "cost": "無料",
        "location": "東京都渋谷区神南1-1",
        "distance": "1.2 km",
        "description": "熱気あふれるオープニングセッションが開催されているおすすめのスポットです。",
        "coordinates": {
          "latitude": 35.6595,
          "longitude": 139.7004
        }
      },
      {
        "id": "2",
        "name": "React Native ワークショップ",
        "spotName": "渋谷・クリエイティブ体験スペース",
        "date": "2026/08/08",
        "time": "10:00-11:30",
        "duration": "約90分",
        "cost": "1,000円",
        "location": "東京都渋谷区道玄坂2-2",
        "distance": "2.1 km",
        "description": "最新テクノロジーのハンズオン体験が楽しめる人気スポットです。",
        "coordinates": {
          "latitude": 35.6612,
          "longitude": 139.7017
        }
      }
    ],
    "total": 2,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 3.2. イベント詳細取得 API (`GET /api/events/{eventId}`)

#### パスパラメータ
- `eventId` (`string`, 必須): イベントID

#### レスポンス (200 OK)
```json
{
  "status": "success",
  "data": {
    "id": "1",
    "name": "SPAJAM 2026 オープニングセレモニー",
    "spotName": "渋谷・特設屋外ステージエリア",
    "date": "2026/08/08",
    "time": "09:00-09:30",
    "duration": "約30分",
    "cost": "無料",
    "location": "東京都渋谷区神南1-1",
    "distance": "1.2 km",
    "description": "SPAJAMのオープニングセレモニーです。全参加者が集まります。",
    "detailedDescription": "このセレモニーでは、主催者からのウェルカムスピーチとオリエンテーションが行われます。",
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

---

### 3.3. 満足度記録投稿 API (`POST /api/reviews`)

※ UI変更により**「体験ログ・メモ（テキスト）」は削除**されました。満足度（1〜5の数値）のみを送信・記録します。

#### リクエストヘッダー
```http
Authorization: Bearer <AccessToken>
```

#### リクエストボディ
```json
{
  "eventId": "1",
  "rating": 5
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `eventId` | `string` | Yes | 対象イベントID |
| `rating` | `number` | Yes | 満足度評価（1〜5の整数数値） |

#### レスポンス (201 Created)
```json
{
  "status": "success",
  "data": {
    "reviewId": "review-456",
    "eventId": "1",
    "userId": "usr_123456",
    "rating": 5,
    "createdAt": "2026-08-08T14:30:00Z"
  }
}
```

---

### 3.4. ログイン API (`POST /api/auth/login`)

#### リクエストボディ
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

#### レスポンス (200 OK)
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_123456",
      "name": "山田 太郎",
      "email": "user@example.com",
      "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
      "isFirstLogin": false,
      "visitedEvents": [
        {
          "id": "visited_1",
          "eventName": "SPAJAM 2026 予選ハッカソン",
          "visitedDate": "2026年8月2日",
          "rating": 5
        }
      ]
    }
  }
}
```

---

### 3.5. 新規ユーザー登録 API (`POST /api/auth/register`)

#### リクエストボディ
```json
{
  "name": "山田 太郎",
  "email": "user@example.com",
  "password": "Password123!"
}
```

#### レスポンス (201 Created)
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_789012",
      "name": "山田 太郎",
      "email": "user@example.com",
      "avatarUrl": null,
      "isFirstLogin": true,
      "visitedEvents": []
    }
  }
}
```

---

### 3.6. マイページ/ユーザー情報取得 API (`GET /api/auth/me`)

#### リクエストヘッダー
```http
Authorization: Bearer <AccessToken>
```

#### レスポンス (200 OK)
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "usr_123456",
      "name": "山田 太郎",
      "email": "user@example.com",
      "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
      "isFirstLogin": false,
      "visitedEvents": [
        {
          "id": "visited_1",
          "eventName": "SPAJAM 2026 予選ハッカソン",
          "visitedDate": "2026年8月2日",
          "rating": 5
        }
      ]
    }
  }
}
```

---

### 3.7. ログアウト API (`POST /api/auth/logout`)

#### レスポンス (200 OK)
```json
{
  "status": "success",
  "data": {
    "message": "ログアウトしました。"
  }
}
```

---

## 4. データベーススキーマ定義 (SQL)

最新のフロントエンド仕様（メモテキスト削除・座標必須化・rating不要化・初回ログインチュートリアル判定）を考慮した最適化スキーマ提案です。

### `users` テーブル
```sql
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  is_first_login BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `events` テーブル
```sql
CREATE TABLE events (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  spot_name VARCHAR(255),
  date VARCHAR(20) NOT NULL,
  time VARCHAR(20) NOT NULL,
  duration VARCHAR(50),
  cost VARCHAR(50),
  location VARCHAR(255) NOT NULL,
  distance VARCHAR(50),
  image_uri VARCHAR(500),
  description TEXT,
  detailed_description TEXT,
  latitude DECIMAL(10, 8) NOT NULL,  -- マップ表示・GPS到着判定に必須
  longitude DECIMAL(11, 8) NOT NULL, -- マップ表示・GPS到着判定に必須
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `reviews` テーブル (満足度評価)
```sql
CREATE TABLE reviews (
  id VARCHAR(50) PRIMARY KEY,
  event_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY unique_event_user (event_id, user_id)
);
```

---

## 5. エラーレスポンス構造 & 共通エラーコード

### エラーレスポンス形式
```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "ユーザー向け表示メッセージ"
  }
}
```

### エラーコード一覧
| エラーコード | HTTPステータス | 説明 |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | メールアドレスまたはパスワードが正しくありません |
| `AUTH_EMAIL_ALREADY_EXISTS` | 409 | 指定されたメールアドレスは既に登録されています |
| `AUTH_UNAUTHORIZED` | 401 | 認証トークンが無効または未送信です |
| `AUTH_TOKEN_EXPIRED` | 401 | トークンの有効期限が切れています |
| `EVENT_NOT_FOUND` | 404 | 指定されたイベントが存在しません |
| `DUPLICATE_REVIEW` | 409 | すでにこのイベントの満足度を記録済みです |
| `VALIDATION_ERROR` | 400 | 入力データ形式エラー |
| `INTERNAL_SERVER_ERROR` | 500 | サーバー内部エラー |

---

## 6. 旧仕様ドキュメントの取扱いについて

- `API-REQUIREMENTS-LOGIN.md` は本ドキュメント `API-REQUIREMENTS.md` に完全統合されました。
- バックエンド担当開発者様は **本ドキュメント `API-REQUIREMENTS.md` のみを閲覧・参照** して実装を進めてください。
