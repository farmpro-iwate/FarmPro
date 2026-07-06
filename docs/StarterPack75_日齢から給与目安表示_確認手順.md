# Starter Pack 75 日齢から給与目安表示 確認手順

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

## 5. 飼料給与目安画面を開く

```text
http://localhost:5173/feeding-guide
```

## 6. 確認すること

画面上部に以下が表示されればOKです。

```text
日齢から給与目安を確認
子牛の日齢
目安を確認
```

## 7. テスト

「子牛の日齢」に次を入力します。

```text
92
```

「目安を確認」を押します。

90日付近の給与目安が表示されれば成功です。

## 8. 別の日齢でも確認

以下も試してください。

```text
30
180
240
```

それぞれ近い目安が表示されればOKです。

## 9. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide/nearest/92
```

データが1件表示されればOKです。

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 75 feeding guide nearest"
git push
```
