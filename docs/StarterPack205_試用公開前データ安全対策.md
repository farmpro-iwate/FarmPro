# Starter Pack 205 試用公開前データ安全対策

## 目的

知り合いによる実データ試用に備え、FarmProの運用データをGitHub管理対象のソースコードから分離します。

## 変更内容

- 実行時データの標準保存先を `server/data` に変更
- `FARMPRO_DATA_DIR` 環境変数で保存先を変更可能
- `server/data` と `server/backups` をGit管理対象外に設定
- 旧保存先 `server/src/data` のデータは、新保存先に対象ファイルがない場合だけ初回自動コピー

## Windowsでの確認手順

1. mainへマージ後、FarmProフォルダで次を実行します。

```text
git pull origin main
```

2. サーバーを起動します。

```text
cd server
npm run dev
```

3. 牛台帳など既存データが表示されることを確認します。

4. `server/data` フォルダが作成され、JSONファイルが入っていることを確認します。

5. データを1件編集したあと、FarmProのルートで次を実行します。

```text
git status
```

6. `server/data` 内のJSONファイルが変更一覧に出ないことを確認します。

## 注意

- `server/src/data` は初期データ・移行元として残しています。今後の実データは `server/data` に保存されます。
- 実データのJSONファイルを手動で `server/src/data` にコピーしないでください。
- 外部公開時は、永続ディスク上のフォルダを `FARMPRO_DATA_DIR` に指定します。
- この対応は誤コミット防止です。ログインや利用者別データ分離は次工程で実装します。
