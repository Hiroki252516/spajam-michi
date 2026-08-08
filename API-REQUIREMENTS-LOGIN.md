# SPAJAM 2026 - 認証（ログイン・新規登録）& マイページ API 要件定義書 (API-REQUIREMENTS-LOGIN.md)

本ドキュメントは、SPAJAM 2026 フロントエンドアプリにおける**ログイン認証・新規アカウント作成およびマイページ（プロフィール・参加イベント一覧）表示**のために、バックエンド側で実装が必要な API 仕様およびデータ要件をまとめた仕様書です。

---

## 1. 概要・認証方式

- **認証方式**: JWT (JSON Web Token) ベースの Bearer 認証
- **トークン保持**:
  - ログイン/登録時のレスポンス `token` (AccessToken) を HTTP Header に付与して以降の全リクエストを送信します。
  - Header 形式: `Authorization: Bearer <AccessToken>`
- **Content-Type**: `application/json`

---

## 2. API エンドポイント一覧

| 機能 | メソッド | エンドポイント | 認証 | 説明 |
|---|---|---|---|---|
| **ログイン** | `POST` | `/api/auth/login` | 不要 | メールアドレス・パスワード認証 |
| **新規ユーザー登録** | `POST` | `/api/auth/register` | 不要 | 新規アカウント作成 |
| **マイページ/ユーザー情報取得** | `GET` | `/api/auth/me` | 必要 | プロフィール ＆ 参加イベント一覧取得 |
| **ログアウト** | `POST` | `/api/auth/logout` | 必要 | トークン/セッション無効化 |

---

## 3. エンドポイント詳細仕様

### 3.1. ログイン (`POST /api/auth/login`)

#### リクエストボディ
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

#### レスポンス (200 OK - 成功時)
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_123456",
      "name": "山田 太郎",
      "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
      "visitedEvents": [
        {
          "id": "visited_1",
          "eventName": "SPAJAM 2026 予選ハッカソン",
          "visitedDate": "2026年8月2日",
          "rating": 5
        },
        {
          "id": "visited_2",
          "eventName": "ナイトマーケット＆フードフェス 2026",
          "visitedDate": "2026年7月20日",
          "rating": 4
        }
      ]
    }
  }
}
```

#### エラーレスポンス (401 Unauthorized - 認証失敗時)
```json
{
  "status": "error",
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "メールアドレスまたはパスワードが正しくありません。"
  }
}
```

---

### 3.2. 新規ユーザー登録 (`POST /api/auth/register`)

#### リクエストボディ
```json
{
  "name": "山田 太郎",
  "email": "user@example.com",
  "password": "Password123!"
}
```

#### レスポンス (201 Created - 成功時)
登録完了後、そのまま自動ログイン状態とできるよう JWT `token` と初期化された `user` オブジェクトを返します。

```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_789012",
      "name": "山田 太郎",
      "avatarUrl": null,
      "visitedEvents": []
    }
  }
}
```

#### エラーレスポンス (409 Conflict - メールアドレス重複時)
```json
{
  "status": "error",
  "error": {
    "code": "AUTH_EMAIL_ALREADY_EXISTS",
    "message": "指定されたメールアドレスは既に登録されています。"
  }
}
```

#### エラーレスポンス (400 Bad Request - 入力バリデーションエラー)
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "パスワードは4文字以上で入力してください。"
  }
}
```

---

### 3.3. マイページ/ユーザー情報取得 (`GET /api/auth/me`)

マイページ描画に必要な「プロフィール（画像・名前）」および「参加イベント一覧（参加日・イベント名・満足度）」を一括取得します。

#### リクエストヘッダー
```http
Authorization: Bearer <AccessToken>
```

#### レスポンス (200 OK - 成功時)
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "usr_123456",
      "name": "山田 太郎",
      "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
      "visitedEvents": [
        {
          "id": "visited_1",
          "eventName": "SPAJAM 2026 予選ハッカソン",
          "visitedDate": "2026年8月2日",
          "rating": 5
        },
        {
          "id": "visited_2",
          "eventName": "ナイトマーケット＆フードフェス 2026",
          "visitedDate": "2026年7月20日",
          "rating": 4
        }
      ]
    }
  }
}
```

---

### 3.4. ログアウト (`POST /api/auth/logout`)

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

## 4. データモデル構造定義

### 1) ユーザーオブジェクト (`User`)
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `string` | Yes | ユーザーユニーク識別ID (例: `usr_123456`) |
| `name` | `string` | Yes | ユーザー表示名 (例: `山田 太郎`) |
| `avatarUrl` | `string` \| `null` | No | プロフィール画像URL |
| `visitedEvents` | `VisitedEvent[]` | Yes | 参加イベント一覧オブジェクト配列 |

### 2) 参加イベントオブジェクト (`VisitedEvent`)
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `string` | Yes | 参加履歴ユニークID (例: `visited_1`) |
| `eventName` | `string` | Yes | 参加したイベント名 (例: `SPAJAM 2026 予選ハッカソン`) |
| `visitedDate` | `string` | Yes | 参加年月日 (例: `2026年8月2日`) |
| `rating` | `number` (1〜5) | Yes | 満足度星5段階評価数値 (1, 2, 3, 4, 5) |

---

## 5. エラーコード一覧

| エラーコード | HTTPステータス | 説明 |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | `401` | メールアドレスまたはパスワード不一致 |
| `AUTH_EMAIL_ALREADY_EXISTS` | `409` | メールアドレス重複 |
| `AUTH_TOKEN_EXPIRED` | `401` | トークン期限切れ |
| `AUTH_UNAUTHORIZED` | `401` | 未ログインまたはトークン無効 |
| `VALIDATION_ERROR` | `400` | 入力パラメータ形式エラー |
