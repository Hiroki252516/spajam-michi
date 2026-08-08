# 開発環境構築ガイド

## 構成

このリポジトリは、npm workspacesでバックエンドとフロントエンドを管理します。

| ディレクトリ | 内容                      | 開発時のポート |
| ------------ | ------------------------- | -------------- |
| `backend`    | Hono API、SQLite          | 8080           |
| `frontend`   | Expo / React Nativeアプリ | 8081           |

データベースにはSQLiteを使用します。外部データベースは必要ありません。

## 必要なソフトウェア

Dockerで起動する場合は、次のソフトウェアを用意してください。

- Git
- Docker Desktopなど、Docker Composeを利用できるDocker環境

Dockerを使わずに起動する場合は、上記に代えてNode.js 22とnpmが必要です。
スマートフォン実機でアプリを確認する場合は、Expo Goも用意してください。

## 初回セットアップ

リポジトリを取得し、プロジェクトディレクトリへ移動します。

```sh
git clone https://github.com/LED-quattro/dev.git
cd dev
```

環境変数ファイルを作成します。

```sh
cp .env.example .env
```

`.env`の各項目は、`.env.example`の説明とチーム内で共有されている開発環境の
値に合わせて設定してください。スマートフォン実機で確認する場合は、PCと
スマートフォンを同じネットワークへ接続し、`LOCAL_IP`と
`EXPO_PUBLIC_API_URL`のホスト部分をPCのローカルIPに変更します。

## Dockerで起動する

バックエンドとフロントエンドをビルドして起動します。

```sh
docker compose up --build
```

起動後、次のURLでexpo goで動作確認できる
192.168.x.xのxは起動しているPCのIPアドレスの数字を使用して、このURLを同じwifi上にあるスマホで開くことでexpo goで確認できる。

- API: `exp://192.168.x.x:8080`
- ヘルスチェック: `exp://192.168.x.x:8080/health`
- Expo開発サーバー: `exp://192.168.x.x:8081`

バックグラウンドで起動する場合は、次のコマンドを使用します。

```sh
docker compose up --build -d
```

ログを確認するには、次のコマンドを使用します。

```sh
docker compose logs -f
```

開発環境を停止するには、次のコマンドを使用します。

```sh
docker compose down
```

SQLiteのデータはDockerボリュームに保存されるため、通常の
`docker compose down`では削除されません。

## Node.jsで直接起動する

依存パッケージをインストールします。

```sh
npm ci
```

ターミナルを2つ開き、それぞれバックエンドとフロントエンドを起動します。

バックエンド:

```sh
npm run dev:backend
```

フロントエンド:

```sh
npm run dev:frontend
```

ローカル起動時のSQLiteファイルは、特に保存先を変更していなければ
`backend/data/app.db`に作成されます。

## 依存パッケージを追加する

依存パッケージは、プロジェクトのルートディレクトリからworkspaceを指定して
追加します。backendまたはfrontendのディレクトリへ移動して個別に
`npm install`を実行しないでください。

backendへ追加する場合:

```sh
npm install <パッケージ名> -w backend
```

frontendへ追加する場合:

```sh
npm install <パッケージ名> -w frontend
```

型定義やテストツールなどの開発時だけ使用するパッケージは、`-D`を付けて
追加します。

```sh
npm install -D <パッケージ名> -w backend
npm install -D <パッケージ名> -w frontend
```

追加後は、対象workspaceの`package.json`とルートの`package-lock.json`が
更新されていることを確認してください。

Docker環境では、既存の`node_modules`ボリュームに古い依存関係が残る場合が
あります。依存関係を追加したworkspaceのボリュームを再作成してから起動します。

backendの依存関係を更新した場合:

```sh
docker compose down
docker volume rm led-quattro_backend_root_node_modules
docker volume rm led-quattro_backend_workspace_node_modules
docker compose up --build
```

frontendの依存関係を更新した場合:

```sh
docker compose down
docker volume rm led-quattro_frontend_root_node_modules
docker volume rm led-quattro_frontend_workspace_node_modules
docker compose up --build
```

上記の操作ではSQLiteの`sqlite_data`ボリュームは削除されません。
`docker compose down -v`はSQLiteのデータも削除するため注意してください。

## 品質チェック

すべてのworkspaceを対象にチェックします。

```sh
npm run lint
npm run format:check
npm run typecheck
npm run build
```

## よくある問題

### スマートフォンからExpoへ接続できない

PCとスマートフォンが同じネットワークに接続されていることと、`.env`の
ネットワーク設定が現在のPCに合っていることを確認してください。LAN接続が
利用できない場合は、トンネルモードでも起動できます。

```sh
npm run start:tunnel -w frontend
```

### ポートが使用中と表示される

8080または8081を使用している別のプロセスを停止するか、`.env`のポート設定を
変更してから再起動してください。`BACKEND_PORT`を変更してスマートフォンから
接続する場合は、`EXPO_PUBLIC_API_URL`のポートも同じ値に変更します。

### 依存関係が一致しない

ルートディレクトリで`npm ci`を実行してください。バックエンドまたは
フロントエンドのディレクトリだけで個別にインストールせず、ルートの
workspaceとして管理します。
