### 最後の署名時に `codesign` が秘密鍵へアクセスする部分です。

`security unlock-keychain` が同じパスワードで成功しているため、パスワード自体よりも、**秘密鍵のアクセス許可（ACL / partition list）**が原因の可能性が高いです。Appleのコード署名関連資料でも、`codesign` が秘密鍵へアクセスできるようキーチェーンのpartition listを設定する方法が案内されています。このコマンドはログインキーチェーン内の秘密鍵のアクセス設定を変更します。共有端末では実行せず、対象のキーチェーンが正しいことを確認してから実行してください。

次を実行してください。パスワードをコマンド履歴へ残さない形です。

```bash
read -s KEYCHAIN_PASSWORD
```

何も表示されませんが、先ほど `security unlock-keychain` で通ったパスワードを入力して Enter。

続けて：

```bash
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$KEYCHAIN_PASSWORD" \
  ~/Library/Keychains/login.keychain-db
```

終わったら変数を消します。

```bash
unset KEYCHAIN_PASSWORD
```

署名identityを確認します。

```bash
security find-identity -v -p codesigning
```

次のように表示されれば正常です。

```text
1) XXXXX... "Apple Development: アカウント名 (...)"
   1 valid identities found
```

その後、再実行します。

```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:8080 \
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.x.x \
npx expo run:ios --device デバイス名
```

確認画面が再度出た場合は、まず `Allow` を押してください。

なお、ログにある

```text
› Skipping dev server
```

は署名エラーではありません。Metroを別プロセスで起動していない場合、実機インストール成功後に別ターミナルで次を実行します。

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.61 \
npx expo start --dev-client --lan
```

`security set-key-partition-list` でもエラーになる場合は、そのエラー全文と `security find-identity -v -p codesigning` の結果が次の判断材料になります。
