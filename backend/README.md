# SPOONT Backend

SPOONTのバックエンドは、Hono、PostgreSQL 17 + pgvector、Mac上のOllama、DuckDuckGo HTML検索、国土地理院の住所検索、Transit APIを組み合わせ、当日参加できるイベントを非同期に検索・推薦します。

## 事前準備

1. `.env.example`を参考に、リポジトリルートへ`.env`を作成します。
2. MacでOllamaを起動し、モデルを取得します。

```sh
ollama pull gemma4:e2b
ollama pull embeddinggemma:300m-qat-q4_0
```

3. Docker Composeを起動します。

```sh
docker compose up --build
```

Docker内のバックエンドは`host.docker.internal:11434`を通してMac上のOllamaへ接続します。レビュー原文を外部LLMへ送らないため、`OLLAMA_BASE_URL`にはlocalhostまたは`host.docker.internal`以外を指定できません。

## 非同期イベント検索API

検索の受付には、ログインで取得したBearerトークンとExpoで取得した現在地が必要です。

```http
GET /api/events/search?latitude=35.6595&longitude=139.7004&q=音楽&limit=10&offset=0
Authorization: Bearer <token>
```

バックエンドは検索を待たせず、`202 Accepted`でジョブを返します。

```json
{
  "status": "success",
  "data": {
    "jobId": "search-...",
    "status": "queued",
    "pollUrl": "/api/events/search/jobs/search-...",
    "expiresAt": "2026-08-09T12:30:00.000Z"
  }
}
```

同じBearerトークンで`pollUrl`を定期取得します。

```http
GET /api/events/search/jobs/search-...
Authorization: Bearer <token>
```

状態は`queued`、`running`、`succeeded`、`failed`のいずれかです。`succeeded`では`events`、`total`、`meta`を返します。`failed`では`error.code`と`error.message`を返します。ジョブは30分で失効し、他ユーザーのジョブは取得できません。

検索結果ではイベント名を公開せず、最寄り駅などの周辺エリアと移動条件を返します。

```json
{
  "id": "evt_xxx",
  "spotName": "渋谷駅周辺",
  "duration": "約24分",
  "cost": "178円（IC）",
  "location": "東京都渋谷区",
  "distance": "2.1 km",
  "travelMode": "TRANSIT",
  "travelDurationMinutes": 24
}
```

- `q`は省略可能で、既定値は`イベント`です。
- 当日開催中または当日これから開始するイベントだけが対象です。
- 現在地の緯度・経度をDuckDuckGoで検索し、検索結果に明記された地域名だけを採用します。
- 出典ページに開始・終了日時と日本国内の会場住所が明記されていないイベントは除外します。
- 会場住所を国土地理院の住所検索で緯度・経度へ変換します。LLMによる座標推測は行いません。
- Transit APIの最短旅程が60分以内のイベントだけを返します。
- 同じ最短旅程から移動所要時間と交通費を取得します。IC運賃を優先し、徒歩のみは`0円`、公共交通の運賃が不明な場合は`料金情報なし`とします。
- イベント座標の500m以内にある駅を優先して`渋谷駅周辺`形式の`spotName`を生成します。駅がなければ停留所、市区町村、`周辺エリア情報なし`の順にフォールバックします。
- イベント名はDBとRAG内部では保持しますが、検索、詳細、参加履歴のAPIレスポンスには含めません。
- 評価履歴があればpgvectorで関連する嗜好メモを取得して順位へ反映します。履歴がなければ移動時間・検索語・開始時刻を使います。

未認証は`401 AUTHENTICATION_REQUIRED`、座標不正は`400 LOCATION_REQUIRED`です。非同期処理中に地域名を確認できない場合はDB内の当日イベントへフォールバックします。Transit APIで全候補の所要時間を判定できない場合は`ROUTING_UNAVAILABLE`としてジョブが`failed`になります。

## 工程別デバッグ計測

サーバー側で`EVENT_SEARCH_DEBUG_TIMINGS=true`を設定し、認証済み検索へ`debug=timings`を指定すると計測できます。環境変数が無効な場合は`403 DEBUG_TIMINGS_DISABLED`、別のdebug値は`400 INVALID_DEBUG_MODE`です。

```http
GET /api/events/search?latitude=35.6595&longitude=139.7004&q=音楽&debug=timings
Authorization: Bearer <token>
```

成功時はポーリング結果の`meta.debugTimings`、失敗時は`data.debugTimings`へ途中までの計測結果を返します。ポーリングURLへ`debug`を再指定する必要はありません。

```json
{
  "version": 1,
  "unit": "ms",
  "totalMs": 12450,
  "stages": {
    "duckDuckGoSearch": {
      "status": "completed",
      "wallMs": 1800,
      "cumulativeMs": 2400,
      "operations": 3,
      "succeeded": 3,
      "failed": 0,
      "averageMs": 800,
      "maxMs": 1100,
      "breakdown": {}
    }
  }
}
```

対象工程は`duckDuckGoSearch`、`eventPageFetch`、`gemmaAnalysis`、`gsiGeocoding`、`transitRouting`、`ragRecommendation`の6種類です。`transitRouting.breakdown`では経路取得を`routePlan`、周辺駅・停留所取得を`nearbyStationLookup`として確認できます。`wallMs`は並列呼出しを含む実際の待ち時間、`cumulativeMs`は個々の呼出し時間の合計なので、並列処理では後者が大きくなる場合があります。キャッシュヒットや候補なしで未実行の工程は`skipped`と`skipReason`を返します。

デバッグ有効時は同じ集計を`event_search_stage_timing`と`event_search_timing_summary`のJSONログにも出力します。ログとAPIには正確な現在地、イベントURL、検索語、レビュー原文を含めません。計測値は検索ジョブと同じ30分で削除され、推薦ログには保存されません。

## 環境変数

- `OLLAMA_BASE_URL`: OllamaのURL
- `OLLAMA_CHAT_MODEL`: 検索計画・抽出・推薦理由用モデル
- `OLLAMA_EMBEDDING_MODEL`: 768次元の埋め込みモデル
- `OLLAMA_REQUEST_TIMEOUT_MS`: Ollamaへの1回の要求の上限。既定値15秒。超過時は検索全体を中断せず、各機能のフォールバックを使用します。
- `TRANSIT_API_BASE_URL`: 既定値`https://api.transit.ls8h.com`
- `EVENT_SEARCH_JOB_TIMEOUT_MS`: 非同期検索全体の上限。既定値120秒
- `EVENT_PAGE_TIMEOUT_MS`: イベントページ1件の取得上限。既定値5秒
- `EVENT_SEARCH_CACHE_TTL_MS`: 共有検索キャッシュの有効期間。既定値15分
- `EVENT_SEARCH_DEBUG_TIMINGS`: 工程別デバッグ計測を許可するか。既定値`false`

## テスト

```sh
npm run typecheck -w backend
npm run lint -w backend
npm test -w backend
npm run build -w backend
```

実PostgreSQL統合テストは`DATABASE_INTEGRATION_URL`を指定すると有効になります。実Ollamaの確認は次のように明示的に有効化します。

```sh
RUN_LOCAL_LLM_TESTS=1 npm test -w backend
```

## 外部サービスとデータ

- DuckDuckGoへは、現在地の地域名を調べる最初の検索に限り正確な緯度・経度を送ります。その後のイベント検索では地域名、日付、検索語、一般化した嗜好タグを送ります。
- Transit APIへは経路検索のため現在地と候補地点の緯度・経度を送り、周辺エリア名の取得には候補地点の緯度・経度を送ります。
- 国土地理院の住所検索へは、公開されたイベント出典ページに記載された会場住所だけを送ります。利用時は国土地理院コンテンツ利用規約と出典表示要件に従ってください。
- ユーザー名、メールアドレス、電話番号、レビュー原文はDuckDuckGo、国土地理院、Transit APIへ送信しません。
- 正確な現在地は検索処理中のメモリだけで扱い、検索ジョブ、検索キャッシュ、推薦ログ、イベント履歴には保存しません。
- DuckDuckGo HTML検索は非公式連携です。また、緯度・経度だけの検索で地域名が得られない場合があります。検索結果で裏づけられない地名をLLMが推測することは認めず、その場合はDB内の当日イベントへフォールバックします。
- 非同期ジョブはバックエンド内で実行します。処理中にプロセスが再起動したジョブは`SEARCH_INTERRUPTED`で失敗となり、再検索が必要です。
