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
GET /api/events/search?area=東京都渋谷区&latitude=35.6595&longitude=139.7004&q=音楽&limit=10&offset=0
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

- `area`は必須です。Expo Locationの`reverseGeocodeAsync`で取得した都道府県・市区町村・区を連結して送信します。駅・施設名や番地は含めません。形式不正・欠落は`400 AREA_REQUIRED`です。
- `q`は省略可能で、既定値は`イベント`です。基本検索は地域・イベント種別・嗜好タグで行い、日付の完全一致は要求しません。
- DuckDuckGo HTML検索は正常な0件、ブロック、解析不能、通信障害を区別し、障害時のみ最大1回再試行します。LLMによる検索計画が失敗しても基本検索を実行します。
- 一覧から詳細ページ、同一イベントの会場地図をリンク深さ2・合計10ページ以内で取得します。検索・抽出は既定75秒（全体上限の62.5%、最大75秒）で打ち切り、取得済みの確認可能な候補を経路計算へ渡します。
- 個別ページのJSON-LDと本文から開催期間、開催時間、会場名・詳細住所を補完します。LLMの抽出日付は出典で照合し、本文で確認できない時刻は採用しません。日付だけのイベントは複数日開催でも`時間未確認`と表示します。複雑な時間帯や休業条件を推測しません。
- 明示された会場座標を優先します。座標がなければ詳細住所を国土地理院で検索し、町域・街区まで一致する結果だけ採用します。行政区域の代表点、地図のカメラ中心、LLMが推測した座標は使用しません。
- 当日開催中または当日開始予定で、会場確認済みのイベントだけを対象にします。単一の営業時間を確認できる候補は、検索にかかった時間も含めた出発時刻から到着予定を計算し、開催終了後に到着するものを除外します。
- Transit APIの最短旅程（会場までの徒歩概算を含む）が60分以内の候補だけを返します。同じ旅程から交通費を取得し、IC運賃を優先します。運賃が不明なら`料金情報なし`と表示します。
- カードの`spotName`は会場座標に対応する駅・停留所を優先し、駅がなければ住所の町域を使用します。近くの役所・消防署名を会場名として表示しません。
- イベント名は到着前のAPIでは公開せず、100m以内への到着確認後に公開します。評価履歴による推薦はローカルOllamaとpgvectorで行います。
- イベントは正規化した名前・開催期間・会場住所で識別し、掲載元URLの違いによる重複を防ぎます。
- 新規取得に失敗した場合は、24時間以内に会場を確認した保存済み候補を距離順に取得し、同じ開催条件・経路条件で絞ります。`meta.source=database_fallback`として画面に代替表示である旨を示します。
- 旧レコードは会場未確認として推薦から除外します。イベントID・レビュー・訪問履歴は保持し、再取得で確認できた新しい候補を追加します。共有キャッシュは新しいキー形式を使い、キャッシュの参照によって会場確認時刻を更新しません。

未認証は`401 AUTHENTICATION_REQUIRED`、座標不正は`400 LOCATION_REQUIRED`です。`meta.currentLocationProvider`は`device_geocoder`です。取得や検証の失敗は`meta.degradedReasons`で区別し、確認できる候補がなければ理由付きで0件を返します。Transit APIで全候補の所要時間を判定できない場合は`ROUTING_UNAVAILABLE`としてジョブが`failed`になります。

## 工程別デバッグ計測

サーバー側で`EVENT_SEARCH_DEBUG_TIMINGS=true`を設定し、認証済み検索へ`debug=timings`を指定すると計測できます。環境変数が無効な場合は`403 DEBUG_TIMINGS_DISABLED`、別のdebug値は`400 INVALID_DEBUG_MODE`です。

```http
GET /api/events/search?area=東京都渋谷区&latitude=35.6595&longitude=139.7004&q=音楽&debug=timings
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

## ローカルLLMの生成制限と代替説明

- Ollamaのチャット生成には`num_predict`を設定します。通常の構造化抽出は最大1024トークン、検索ツール呼び出しと嗜好タグ抽出は最大256トークンです。既定のリクエスト上限15秒、検索・抽出75秒、検索全体120秒も維持します。
- 生成用JSONスキーマは受信時に使うZodスキーマから作成し、文字数・配列件数・必須項目の制限を一致させます。トークン上限で打ち切られた出力、不完全なJSON、コードブロック・制御トークン・繰り返しを含む文章は採用しません。
- 推薦理由は候補3件ずつ、最大512トークンで生成します。候補IDを固定したオブジェクト形式を使用し、未知のIDや120文字を超える理由を拒否します。推薦理由の生成工程全体にも15秒の上限を設けます。
- 説明の生成が失敗しても確認済みイベントは返します。失敗した候補の理由だけ、Transit APIで確認した移動時間に基づく定型文へ切り替え、`meta.degradedReasons`に`recommendation_reason_unavailable`を記録します。成功済みの候補の理由は保持します。
- イベント抽出のLLM出力は1ページ最大4件、タグ8件以内です。出典の住所・日時の照合は継続します。検索計画はモデル応答・ツール実行とも最大3回とし、検索結果が得られた時点で終了します。
- 抽出・推薦理由の失敗は`ollama_output_limit`、`ollama_invalid_json`、`ollama_invalid_structure`、`ollama_invalid_text`、`ollama_request_timeout`などで区別します。ログにはモデルの出力原文を残さず、理由と出典ホスト名を記録します。

## 外部サービスとデータ

- 現在地の住所変換は端末のExpo Locationで行います。DuckDuckGoへは地域名、検索語、一般化した嗜好タグを送信し、現在地の緯度・経度は送信しません。
- Transit APIへは経路検索のため現在地と確認済み会場の緯度・経度を送り、最寄り駅取得には会場の緯度・経度を送ります。
- 国土地理院の住所検索へは、公開されたイベント出典ページに記載された会場住所だけを送ります。利用時は国土地理院コンテンツ利用規約と出典表示要件に従ってください。
- ユーザー名、メールアドレス、電話番号、レビュー原文はDuckDuckGo、国土地理院、Transit APIへ送信しません。
- 正確な現在地は検索処理中のメモリだけで扱い、検索ジョブ、検索キャッシュ、推薦ログ、イベント履歴には保存しません。
- DuckDuckGo HTML検索は非公式連携のためブロックや応答形式の変更が起こり得ます。ページに裏づけられない会場・時刻をLLMに補わせず、障害時は確認済み保存データまたは理由付きの0件を返します。
- 非同期ジョブはバックエンド内で実行します。処理中にプロセスが再起動したジョブは`SEARCH_INTERRUPTED`で失敗となり、再検索が必要です。
