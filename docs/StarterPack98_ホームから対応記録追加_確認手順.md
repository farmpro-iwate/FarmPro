# Starter Pack 98 ホーム注意子牛リストから対応記録追加 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 5. ホーム画面を開く

Chromeで開きます。

```text
http://localhost:5173
```

## 6. 確認すること

ホーム画面の注意子牛リストに以下が表示されればOKです。

```text
対応記録
```

## 7. 対応記録ボタン確認

注意子牛リストの「対応記録」を押します。

新規登録画面に移動し、以下のような表示が出れば成功です。

```text
ホームの注意子牛リストから、子牛名・日齢・アラート種別を引き継ぎました。
```

## 8. 引き継ぎ確認

新規登録画面で以下が入っていればOKです。

```text
子牛名
日齢
アラート種別
メモ
```

## 9. 登録確認

「登録する」を押します。

一覧画面に戻り、登録した内容が表示されれば成功です。

```text
http://localhost:5173/feeding-alert-actions
```

## 10. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-alert-actions
```

登録した内容がJSONに増えていればOKです。

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 98 home to feeding alert action"
git push
```

## 12. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
