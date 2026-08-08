# iOS Simulator・実機セットアップガイド

このドキュメントでは、LED Quattroのfrontendを次の環境で動かすまでの手順を説明します。

1. XcodeのiOS Simulatorで動作確認する
2. 開発用に署名したアプリをiPhone実機へインストールする
3. 実機からMac上のMetroとDocker backendへ接続する

この手順はmacOSでのみ実行できます。コマンドは、特に記載がない限りリポジトリのルートで実行してください。

> [!IMPORTANT]
> `docker compose` はリポジトリのルート、`expo prebuild` と `expo run:ios` は `frontend` で実行します。実行場所を間違えると、ルートに不要な `ios/` や `app.json` が生成されることがあります。

## 1. 必要な環境

以下を準備します。

- macOS
- Git
- Docker Desktop
- Node.js 22
- npm
- Xcode
- Xcode Command Line Tools
- CocoaPods
- Apple Account
- 実機確認用のUSBケーブル
- MacとiPhoneが接続できる同一Wi-Fi

バージョンを確認します。

```sh
git --version
docker --version
docker compose version
node --version
npm --version
xcodebuild -version
pod --version
```

`pod` が見つからない場合は、CocoaPodsをインストールします。

```sh
brew install cocoapods
```

Xcodeは、接続するiPhoneのiOSバージョンをサポートするバージョンを使用してください。iPhoneのiOSがXcodeより新しい場合、実機を認識できてもビルドやインストールに失敗することがあります。

- [Apple: Xcodeの対応バージョン](https://developer.apple.com/support/xcode/)
- [Expo: iOS Simulatorのセットアップ](https://docs.expo.dev/workflow/ios-simulator/)

## 2. リポジトリを取得する

初めて取得する場合はcloneします。

```sh
git clone https://github.com/LED-quattro/dev.git
cd dev
```

すでにclone済みの場合は、最新のmainを取得します。

```sh
git switch main
git pull origin main
```

作業ブランチを作成します。

```sh
git switch -c chore/setup-ios
```

依存パッケージをインストールします。

```sh
npm ci
```

今回はExpoとXcodeをMac上で実行するため、Docker内とは別にMac側の `node_modules` が必要です。

## 3. Xcodeをセットアップする

### 3.1 Command Line Tools

Xcodeを起動し、次を開きます。

```text
Xcode → Settings → Locations → Command Line Tools
```

インストールした最新のXcodeを選択します。必要に応じてターミナルから切り替えます。

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### 3.2 iOS Simulator

Xcodeで次を開き、iOSのSimulator Runtimeをインストールします。

```text
Xcode → Settings → Components → Platform Support → iOS → Get
```

特定のSimulatorを追加する場合は、次を開きます。

```text
Xcode → Window → Devices and Simulators → Simulators → ＋
```

## 4. iOSアプリ設定を追加する

`frontend/app.json` の `expo` 内に `ios` 設定を追加します。

```json
{
  "expo": {
    "name": "LED Quattro",
    "slug": "led-quattro",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "ios": {
      "bundleIdentifier": "jp.ledquattro.app",
      "supportsTablet": false,
      "infoPlist": {
        "NSLocalNetworkUsageDescription": "開発中にローカルのAPIサーバーへ接続します。"
      }
    },
    "web": {
      "bundler": "metro"
    }
  }
}
```

`bundleIdentifier` はチーム内で合意した一意の値を使用します。個人の検証用に別の値を使用する場合は、個人設定を誤って共有ブランチへコミットしないよう注意してください。

## 5. iOSネイティブプロジェクトを生成する

必ず `frontend` へ移動します。

```sh
cd frontend
pwd
```

`pwd` の末尾が `/frontend` であることを確認してから実行します。

```sh
npx expo prebuild --platform ios
```

成功すると、主に次が生成されます。

```text
frontend/ios/
frontend/ios/LEDQuattro.xcodeproj
frontend/ios/LEDQuattro.xcworkspace
```

ワークスペースを確認します。

```sh
find ios -maxdepth 1 -name "*.xcworkspace" -print
```

Xcodeで開きます。

```sh
open ios/*.xcworkspace
```

`.xcodeproj` ではなく `.xcworkspace` を開いてください。`.xcworkspace` にはアプリ本体とCocoaPodsの依存関係が含まれます。

## 6. Xcodeの署名を設定する

### 6.1 Apple Accountを追加する

Xcodeで次を開き、自分のApple Accountを追加します。

```text
Xcode → Settings → Accounts → ＋ → Apple Account
```

### 6.2 Teamを設定する

Xcode左側の青いプロジェクトアイコンを選択し、次を開きます。

```text
TARGETS → LEDQuattro → Signing & Capabilities
```

以下を設定します。

- `Automatically manage signing`: オン
- `Team`: チームのDeveloper Teamまたは自分のPersonal Team
- `Bundle Identifier`: `frontend/app.json` と同じ値

無料のPersonal Teamでも自分の端末へインストールできますが、署名は通常7日で期限切れになります。期限切れ後は再ビルド・再インストールが必要です。TestFlightやApp Storeでの配布にはApple Developer Programが必要です。

### 6.3 `codesign` が秘密鍵へアクセスできない場合

署名の最後に `codesign` が失敗し、`security unlock-keychain` は成功する場合、パスワードではなくログインキーチェーン内の秘密鍵に対するアクセス許可（ACL / partition list）が原因の可能性があります。

> [!CAUTION]
> 以下のコマンドは、ログインキーチェーン内の秘密鍵に対するアクセス設定を変更します。共有Macでは実行せず、自分のMacであることと、対象が `~/Library/Keychains/login.keychain-db` で正しいことを確認してから実行してください。

まず、キーチェーンのパスワードをシェル変数へ読み込みます。

```sh
read -s KEYCHAIN_PASSWORD
```

入力内容は画面に表示されません。Macのログインキーチェーンを解除できるパスワードを入力してEnterを押します。この方法ではパスワードそのものをコマンド履歴へ残しません。

`codesign` が秘密鍵へアクセスできるようpartition listを設定します。

```sh
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$KEYCHAIN_PASSWORD" \
  ~/Library/Keychains/login.keychain-db
```

処理後は、パスワードを保持した変数を必ず削除します。

```sh
unset KEYCHAIN_PASSWORD
```

コード署名用identityを確認します。

```sh
security find-identity -v -p codesigning
```

正常時の例です。

```text
1) XXXXX... "Apple Development: アカウント名 (...)"
   1 valid identities found
```

確認画面が再表示された場合は、自分が開始したXcodeまたは `codesign` の処理であることを確認して `Allow` を選びます。

設定後、実機向けビルドを再実行します。IPとUDIDは自分の環境の値に置き換えます。

```sh
export LED_QUATTRO_MAC_IP=192.168.11.14
export LED_QUATTRO_IOS_UDID=00008150-0012345678901234

EXPO_PUBLIC_API_URL=http://$LED_QUATTRO_MAC_IP:8080 \
REACT_NATIVE_PACKAGER_HOSTNAME=$LED_QUATTRO_MAC_IP \
npx expo run:ios --device "$LED_QUATTRO_IOS_UDID"
```

`security set-key-partition-list` でも失敗する場合は、表示されたエラー全文と、次のコマンドの結果を確認します。

```sh
security find-identity -v -p codesigning
```

ログに `Skipping dev server` と表示されても、これは署名エラーではありません。実機インストール後にJavaScriptを読み込めない場合は、「13. MetroからJavaScriptを読み込む」の手順でMetroを起動します。

## 7. backendを起動する

リポジトリのルートへ戻ります。

```sh
cd ..
pwd
```

`.env` がない場合は作成します。

```sh
cp .env.example .env
```

MacのLAN内IPを確認します。

```sh
ipconfig getifaddr en0
```

例として `192.168.11.14` が表示された場合、`.env` を次のようにします。

```env
BACKEND_PORT=8080
FRONTEND_PORT=8081
LOCAL_IP=192.168.11.14
EXPO_PUBLIC_API_URL=http://192.168.11.14:8080
```

backendを起動します。

```sh
docker compose up --build -d backend
```

状態を確認します。

```sh
docker compose ps
```

次の2点を確認します。

- backendが `(healthy)`
- ポートが `0.0.0.0:8080->8080/tcp`

Macからヘルスチェックを実行します。

```sh
curl http://127.0.0.1:8080/health
```

正常時の例です。

```json
{
  "status": "ok",
  "database": "sqlite",
  "sqliteVersion": "3.51.3"
}
```

> [!NOTE]
> `docker compose` を `frontend` から実行すると、ルートの `.env` が読み込まれず、8080ではなくランダムなホストポートが割り当てられる場合があります。Docker Composeは原則としてリポジトリのルートから実行してください。

## 8. Simulatorで確認する

Docker版frontendが起動している場合は停止します。

```sh
docker compose stop frontend
```

`frontend` へ移動します。

```sh
cd frontend
```

Simulator向けにビルドします。

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080 \
npx expo run:ios --device
```

表示された一覧から使用するiPhone Simulatorを選びます。

成功時はログに次が含まれます。

```text
Build Succeeded
Debug-iphonesimulator/LEDQuattro.app
```

Simulator上で次を確認します。

- LED Quattroが起動する
- 画面が正常に描画される
- API URLが期待した値になっている
- backendを利用する処理が成功する

## 9. iPhone実機を準備する

### 9.1 USB接続

最初はiPhoneをUSBケーブルでMacへ接続し、iPhoneのロックを解除します。「このコンピュータを信頼しますか」と表示された場合は、自分のMacであることを確認して許可します。

### 9.2 Developer Mode

iPhoneで次を開きます。

```text
設定 → プライバシーとセキュリティ → デベロッパモード
```

デベロッパモードをオンにすると再起動が求められます。再起動後、もう一度有効化を確認します。

### 9.3 Xcodeで接続確認

Xcodeで次を開きます。

```text
Window → Devices and Simulators → Devices
```

実機が `Connected` になり、準備処理が完了するまで待ちます。

ターミナルからも確認できます。

```sh
xcrun xctrace list devices
```

`Devices` に表示された実機のUDIDを使用します。`Devices Offline` や `Simulators` にあるUDIDを使用しないでください。

## 10. 実機からMacへの疎通を確認する

MacとiPhoneを同じWi-Fiへ接続します。iPhoneのSafariで次を開きます。IPは自分のMacの値へ置き換えてください。

```text
http://192.168.11.14:8080/health
```

ヘルスチェックのJSONが表示されれば、iPhoneからDocker backendへ接続できています。

VPN、ゲストWi-Fi、ルーターの端末間通信制限があると接続できない場合があります。

## 11. 実機へDebugビルドをインストールする

8081番で古いMetroが動いていないか確認します。

```sh
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

別のターミナルでMetroが動いている場合は、そのターミナルで `Control + C` を押して停止します。

MacのIPと、`xcrun xctrace list devices` で確認した実機UDIDを変数へ設定します。

```sh
export LED_QUATTRO_MAC_IP=192.168.11.14
export LED_QUATTRO_IOS_UDID=00008150-0012345678901234
```

必ず `frontend` にいることを確認します。

```sh
pwd
```

末尾が `/frontend` であることを確認し、実機向けビルドを実行します。

```sh
EXPO_PUBLIC_API_URL=http://$LED_QUATTRO_MAC_IP:8080 \
REACT_NATIVE_PACKAGER_HOSTNAME=$LED_QUATTRO_MAC_IP \
npx expo run:ios --device "$LED_QUATTRO_IOS_UDID"
```

成功時はログに次が含まれます。

```text
Build Succeeded
Debug-iphoneos/LEDQuattro.app
Installing on <実機名>
```

`Debug-iphonesimulator` と表示された場合はSimulatorが選択されています。

## 12. iPhoneで開発者を信頼する

初回起動時に「信頼されていないデベロッパ」と表示された場合、iPhoneで次を開きます。

```text
設定 → 一般 → VPNとデバイス管理
```

`Apple Development: <自分のApple Account>` を選び、自分のアカウントであることを確認して信頼します。

## 13. MetroからJavaScriptを読み込む

DebugビルドはJavaScriptをアプリ内に埋め込まず、MacのMetroから取得します。別のターミナルを開き、`frontend` でMetroを起動します。

```sh
cd /path/to/dev/frontend

export LED_QUATTRO_MAC_IP=192.168.11.14

EXPO_PUBLIC_API_URL=http://$LED_QUATTRO_MAC_IP:8080 \
REACT_NATIVE_PACKAGER_HOSTNAME=$LED_QUATTRO_MAC_IP \
npx expo start --lan
```

このターミナルはアプリの使用中は終了しないでください。

iPhoneで次を開き、Metroへ到達できることを確認できます。

```text
http://192.168.11.14:8081/status
```

正常時は次が表示されます。

```text
packager-status:running
```

iPhoneでLED Quattroのローカルネットワーク権限も有効にします。

```text
設定 → プライバシーとセキュリティ → ローカルネットワーク → LED Quattro
```

アプリを完全に終了して開き直すか、エラー画面の `Reload JS` を押します。

## 14. Metroなしで起動するRelease確認

ReleaseビルドはJavaScriptをアプリへ埋め込むため、Metroを起動せずにアプリを開けます。

```sh
EXPO_PUBLIC_API_URL=http://$LED_QUATTRO_MAC_IP:8080 \
npx expo run:ios --configuration Release --device "$LED_QUATTRO_IOS_UDID"
```

ただし、API URLがMacのLAN内IPのままなら、次の条件は引き続き必要です。

- Macが起動している
- Docker backendが起動している
- MacとiPhoneが同じネットワークにいる

Macから独立して動作する本番アプリにするには、backendをHTTPSでアクセスできる環境へデプロイし、本番API URLへ変更する必要があります。

## 15. 終了方法

Metroを停止する場合は、Metroを実行しているターミナルで `Control + C` を押します。

Dockerを停止します。

```sh
cd /path/to/dev
docker compose down
```

通常は次を実行しないでください。

```sh
docker compose down -v
```

`-v` を付けるとSQLiteデータを含むDockerボリュームも削除されます。

使用した変数を解除します。

```sh
unset LED_QUATTRO_MAC_IP
unset LED_QUATTRO_IOS_UDID
```

## 16. トラブルシューティング

### `BACKEND_PORT` が未設定で8080へ接続できない

次の警告が表示される場合があります。

```text
The "BACKEND_PORT" variable is not set
```

`docker compose ps` で `50518->8080` のようなランダムポートになっている場合、リポジトリのルートからコンテナを再作成します。

```sh
docker compose up --build -d --force-recreate backend
```

`frontend` から実行する必要がある場合は、envファイルを明示します。

```sh
docker compose --env-file ../.env up --build -d --force-recreate backend
```

### `Use port 8082 instead?` と表示される

8081番で別のMetroが動いています。通常は `n` を選び、古いMetroを起動したターミナルで `Control + C` を押してから再実行します。複数のMetroを動かすと接続先を判別しにくくなるため、意図がない限り8082へ変更しません。

### `dquote>` と表示される

コマンド内のダブルクォートが閉じられていない状態です。`Control + C` で中止し、スマートクォート `“` `”` ではなく半角の `"` を使用します。UDIDには空白がないため、引用符を付けずに指定することもできます。

### `No device UDID or name matching` と表示される

指定したUDIDが別端末、オフライン端末、またはSimulatorの可能性があります。

```sh
xcrun xctrace list devices
```

`Devices` に表示される接続中の実機UDIDを使用してください。

### `Unexpected devicectl JSON version output` と表示される

Expo CLIがXcodeの端末情報を解釈できない場合があります。まずXcodeをiPhoneのiOSに対応する最新版へ更新します。それでも失敗する場合は、Xcodeで `ios/LEDQuattro.xcworkspace` を開き、上部の実行先から実機を選択して `Product → Run` を実行します。

### 「信頼されていないデベロッパ」と表示される

「設定 → 一般 → VPNとデバイス管理」で、自分のApple Development証明書を信頼します。

### `No script URL provided` と表示される

DebugアプリがMetroへ接続できていません。次を確認します。

1. Metroが8081番で起動している
2. iPhoneとMacが同じWi-Fiにいる
3. iPhoneの「ローカルネットワーク」でLED Quattroが許可されている
4. iPhoneのSafariで `http://<MacのIP>:8081/status` が開ける
5. MacのファイアウォールがNode.jsの受信接続を許可している

### `ios: icon: No icon is defined in the Expo config` と表示される

アプリアイコンが未設定という警告です。開発ビルドを止めるエラーではありません。本番配布前に `frontend/app.json` のアイコン設定を追加します。

### リポジトリのルートに `ios/` と `app.json` が生成された

`expo prebuild` または `expo run:ios` をリポジトリのルートで実行しています。処理を中止し、`git status --short` で変更を確認してください。正しい生成先は `frontend/ios/` です。個人の作業が混在している可能性があるため、確認せずに `git reset --hard` や一括削除を実行しないでください。

## 17. Gitへ反映する前の確認

ネイティブプロジェクトや署名設定には、個人のTeam IDが含まれる場合があります。

```sh
git status --short
git diff
```

以下を確認します。

- 個人のApple Accountや端末UDIDが含まれていない
- 個人用の `DEVELOPMENT_TEAM` を共有する必要があるかチームで合意している
- `frontend/ios/` をGit管理するか、prebuildで再生成するかチーム方針が決まっている
- `.env` がコミット対象になっていない
- API URLに個人のLAN内IPがハードコードされていない

品質チェックを実行します。

```sh
cd /path/to/dev
npm run lint
npm run format:check
npm run typecheck
npm run build
```

以上で、Simulator確認、iPhone実機への開発用インストール、Mac上のbackend・Metroへの接続まで完了です。
