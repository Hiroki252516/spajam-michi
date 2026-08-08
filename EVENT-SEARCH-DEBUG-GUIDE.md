# イベント検索・デバッグ表示の見方

この文書では、SPOONTのイベント検索で、次の6工程のどこに時間がかかっているかを確認する方法を説明します。

1. DuckDuckGo検索
2. イベントページ取得
3. Gemma解析
4. 国土地理院API
5. Transit API
6. RAG推薦

デバッグ計測は通常の検索では無効です。サーバー側で許可したうえで、認証済みリクエストが明示的に要求した場合だけ実行されます。

## 1. デバッグ計測を有効にする

リポジトリ直下の`.env`へ次を追加します。

```env
EVENT_SEARCH_DEBUG_TIMINGS=true
```

Docker Composeで起動している場合は、バックエンドを再作成します。

```sh
docker compose up -d --build backend
```

`EVENT_SEARCH_DEBUG_TIMINGS`を変更しただけでは、起動済みコンテナへ値が反映されません。必ずバックエンドを再作成してください。

## 2. デバッグ付き検索を開始する

ログインAPIで取得したBearerトークンを指定し、通常の検索URLへ`debug=timings`を追加します。

```sh
curl -sS \
  -H "Authorization: Bearer <ログインで取得したトークン>" \
  "http://localhost:8080/api/events/search?latitude=35.6595&longitude=139.7004&q=音楽&debug=timings"
```

検索処理は非同期です。最初のレスポンスはイベント一覧ではなく、次のような検索ジョブです。

```json
{
  "status": "success",
  "data": {
    "jobId": "search-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "status": "queued",
    "pollUrl": "/api/events/search/jobs/search-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "expiresAt": "2026-08-09T12:30:00.000Z"
  }
}
```

`pollUrl`を、同じBearerトークンで定期的に取得します。ポーリング時に`debug=timings`をもう一度付ける必要はありません。

```sh
curl -sS \
  -H "Authorization: Bearer <ログインで取得したトークン>" \
  "http://localhost:8080/api/events/search/jobs/<jobId>"
```

ジョブの`status`は次の順で変化します。

```text
queued → running → succeeded
                   ↘ failed
```

## 3. 計測結果が表示される場所

検索成功時は、ポーリング結果の`data.meta.debugTimings`に表示されます。

```json
{
  "status": "success",
  "data": {
    "status": "succeeded",
    "events": [],
    "meta": {
      "debugTimings": {
        "version": 1,
        "unit": "ms",
        "totalMs": 12450,
        "stages": {}
      }
    }
  }
}
```

検索失敗時は、途中までに取得できた計測結果が`data.debugTimings`に表示されます。

```json
{
  "status": "success",
  "data": {
    "status": "failed",
    "error": {
      "code": "ROUTING_UNAVAILABLE",
      "message": "現在、移動時間を計算できません。"
    },
    "debugTimings": {
      "version": 1,
      "unit": "ms",
      "totalMs": 10500,
      "stages": {}
    }
  }
}
```

## 4. 各フィールドの意味

各工程は次の形式で表示されます。

```json
{
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
```

| フィールド     | 意味                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `totalMs`      | 検索ジョブ本体の開始から、検索サービスが完了または失敗するまでの時間                 |
| `status`       | その工程が`completed`、`degraded`、`failed`、`skipped`のどれだったか                 |
| `wallMs`       | 並列処理を考慮した、その工程で実際に待った時間。同時実行された時間は重複して数えない |
| `cumulativeMs` | 個々の呼び出し時間を単純に合計した値。同時実行された時間もそれぞれ数える             |
| `operations`   | その工程で実行した処理または外部呼び出しの回数                                       |
| `succeeded`    | 成功した回数                                                                         |
| `failed`       | 失敗した回数                                                                         |
| `averageMs`    | 1回あたりの平均時間。失敗した呼び出しの経過時間も含む                                |
| `maxMs`        | 最も時間がかかった1回の処理時間                                                      |
| `breakdown`    | 工程内の固定処理名ごとの同じ集計                                                     |
| `skipReason`   | 工程が実行されなかった理由。`status`が`skipped`の場合だけ表示されることがある        |

時間の単位はすべてミリ秒です。`1000ms`が1秒です。

### wallMsとcumulativeMsの違い

例えば、3ページを同時に取得し、それぞれ2秒かかった場合は、おおむね次のようになります。

```text
wallMs       ≒ 2000ms
cumulativeMs ≒ 6000ms
operations   = 3
```

利用者が実際に待った時間へ近いのは`wallMs`です。外部サービスへどれだけの処理を依頼したかを見る場合は`cumulativeMs`を使います。

工程同士も一部が並行または離れた時点で実行されるため、6工程の`wallMs`を足しても`totalMs`とは一致しません。全体の待ち時間は`totalMs`、ボトルネック候補は各工程の`wallMs`と`maxMs`で判断してください。

## 5. 6工程の対応表

| 表示名              | 計測対象                                                     | `breakdown`に現れる主な名前                                                                                     |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `duckDuckGoSearch`  | 現在地の地域検索、イベント検索のDuckDuckGo HTTP通信          | `currentLocationSearch`、`eventDiscoverySearch`                                                                 |
| `eventPageFetch`    | 検索結果上位ページのHTML取得                                 | `publicPageFetch`                                                                                               |
| `gemmaAnalysis`     | 現在地名抽出、検索tool calling、イベントの構造化抽出         | `currentLocationExtraction`、`searchToolPlanning`、`eventStructuredExtraction`                                  |
| `gsiGeocoding`      | 公開イベントページの会場住所を国土地理院APIで座標化          | `venueAddressGeocoding`                                                                                         |
| `transitRouting`    | 現在地から各候補地点までのTransit API旅程と周辺エリア取得     | `routePlan`、`nearbyStationLookup`                                                                               |
| `ragRecommendation` | 嗜好メモ、EmbeddingGemma、pgvector検索、ランキング、推薦理由 | `preferenceMemoryLoadAndBackfill`、`candidateEmbeddingVectorSearchAndRanking`、`recommendationReasonGeneration` |

`breakdown`にはイベントURL、現在地、検索語などは表示されません。同じ固定処理名の呼び出しがまとめて集計されます。

## 6. statusの読み方

| status      | 意味                                   | 確認すること                                                    |
| ----------- | -------------------------------------- | --------------------------------------------------------------- |
| `completed` | 実行した処理がすべて成功した           | `wallMs`、`maxMs`が大きい工程を確認する                         |
| `degraded`  | 成功と失敗が混在した                   | `failed`と`breakdown`を確認する。候補数が減っている可能性がある |
| `failed`    | その工程で実行した処理がすべて失敗した | 構造化ログ、外部サービスの稼働状態、ネットワークを確認する      |
| `skipped`   | その工程を実行しなかった               | `skipReason`を確認する。必ずしも障害ではない                    |

主な`skipReason`は次のとおりです。

| skipReason                     | 意味                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `discovery_cache_hit`          | 15分キャッシュを利用したため、ページ取得や会場座標化を再実行しなかった   |
| `current_location_unavailable` | DuckDuckGo検索結果から現在地の地域を確認できず、DBフォールバックへ移った |
| `no_search_results`            | イベント検索結果が0件だった                                              |
| `no_extractable_events`        | 日時と会場住所を確認できるイベントを抽出できなかった                     |
| `no_candidates`                | Transit APIへ渡す当日候補が0件だった                                     |

## 7. ボトルネックの判断例

### DuckDuckGo検索が遅い

`duckDuckGoSearch.wallMs`や`breakdown.eventDiscoverySearch.maxMs`が大きい場合です。DuckDuckGoの応答、tool callingによる検索回数、ネットワーク状態を確認します。

### 一部のイベントページだけが遅い

`eventPageFetch.maxMs`が大きく、`averageMs`との差も大きい場合です。特定ページがタイムアウト上限へ近づいている可能性があります。URL自体はデバッグ表示へ出さないため、必要な場合はページ取得処理へ一時的な開発ログを追加して調査します。

### Gemmaがボトルネック

`gemmaAnalysis.wallMs`が大きい場合は、`breakdown`で次を切り分けます。

- `currentLocationExtraction`: 現在地名の抽出
- `searchToolPlanning`: DuckDuckGo検索語とtool callingの判断
- `eventStructuredExtraction`: イベントページの構造化解析

Ollamaの起動状態、モデルのロード時間、Macのメモリ・CPU・GPU使用率も確認します。

### 国土地理院APIが遅い

`gsiGeocoding.operations`が多い場合は、抽出されたイベントごとに住所検索が行われています。`maxMs`だけが大きい場合は一時的な外部API遅延、全体が大きい場合は候補数の影響が考えられます。

### Transit APIが遅い

`transitRouting.breakdown.routePlan`は経路判定、`nearbyStationLookup`は`渋谷駅周辺`のような表示用エリア取得です。`transitRouting.operations`は両方の呼出回数を合算します。`cumulativeMs`が大きくても`wallMs`が比較的小さければ、並列処理が有効に働いています。`wallMs`と`maxMs`が両方大きい場合はTransit APIの応答がボトルネックです。

### RAG推薦が遅い

`ragRecommendation.breakdown`で次を確認します。

- `preferenceMemoryLoadAndBackfill`: 嗜好メモ取得、未生成Embeddingの補完
- `candidateEmbeddingVectorSearchAndRanking`: 候補Embedding、pgvector検索、スコア計算
- `recommendationReasonGeneration`: Gemmaによる推薦理由生成

初回検索だけ遅い場合は、EmbeddingGemmaのモデルロードや`pending`メモの補完が原因になっている可能性があります。

## 8. Dockerログで確認する

デバッグ有効時は、APIと同じ集計がJSONログにも出力されます。

```sh
docker compose logs -f backend
```

工程別ログだけを見る場合は次のように絞り込めます。

```sh
docker compose logs -f backend | grep 'event_search_stage_timing'
```

検索全体の集計だけを見る場合は次のとおりです。

```sh
docker compose logs -f backend | grep 'event_search_timing_summary'
```

ログの`jobId`と、検索受付レスポンスの`jobId`を照合してください。

## 9. よくあるエラー

| エラーコード              | 原因                                               | 対処                                                                    |
| ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `AUTHENTICATION_REQUIRED` | Bearerトークンがない、無効、期限切れ               | 再ログインして新しいトークンを指定する                                  |
| `LOCATION_REQUIRED`       | 緯度・経度がない、または範囲外                     | Expoが取得した有効な`latitude`と`longitude`を送る                       |
| `DEBUG_TIMINGS_DISABLED`  | サーバー側の計測許可が無効                         | `.env`で`EVENT_SEARCH_DEBUG_TIMINGS=true`にしてバックエンドを再作成する |
| `INVALID_DEBUG_MODE`      | `debug=timings`以外を指定した                      | `debug=timings`へ修正する                                               |
| `ROUTING_UNAVAILABLE`     | Transit APIですべての候補を判定できなかった        | Transit APIの稼働状態と`transitRouting`の途中結果を確認する             |
| `SEARCH_JOB_NOT_FOUND`    | ジョブが別ユーザーのもの、または30分の有効期限切れ | 同じユーザーで再検索する                                                |

## 10. デバッグ終了後

調査が終わったら、`.env`を次へ戻してバックエンドを再作成します。

```env
EVENT_SEARCH_DEBUG_TIMINGS=false
```

```sh
docker compose up -d --build backend
```

デバッグ計測値は検索ジョブと同じ30分で削除され、長期の推薦ログには保存されません。
