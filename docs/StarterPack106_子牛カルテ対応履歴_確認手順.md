# Starter Pack 106 子牛カルテ対応履歴 確認手順

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

## 5. 子牛一覧を開く

Chromeで開きます。

```text
http://localhost:5173/calves
```

子牛一覧から、子牛カルテまたは詳細画面を開きます。

## 6. 確認すること

子牛カルテに以下が表示されれば成功です。

```text
給与アラート対応履歴
対応記録を追加
```

## 7. 対応記録がない場合

以下が表示されれば正常です。

```text
この子牛の給与アラート対応記録はまだありません。
```

## 8. 対応記録を追加する

子牛カルテの「対応記録を追加」を押します。

新規登録画面に移動し、子牛名や日齢が引き継がれていればOKです。

## 9. 履歴表示の確認

対応記録を登録したあと、もう一度その子牛カルテを開きます。

以下が表示されれば成功です。

```text
対応日
アラート
対応内容
状態
次回確認日
メモ
編集
```

## 10. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-alert-actions
```

登録した対応記録が出ていればOKです。

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 106 calf detail feeding alert actions"
git push
```

## 12. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
