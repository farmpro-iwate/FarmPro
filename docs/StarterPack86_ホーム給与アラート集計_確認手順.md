# Starter Pack 86 ホーム給与アラート集計 確認手順

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

```text
http://localhost:5173
```

またはログイン後のホーム画面を確認します。

## 6. 確認すること

ホーム画面に以下が表示されればOKです。

```text
給与アラート
全子牛
不足気味
多め
実績なし
給与目安で確認
レポートで確認
```

## 7. ボタン確認

以下のボタンを押して移動できるか確認します。

```text
給与目安で確認
レポートで確認
```

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

JSONの中に以下があればOKです。

```text
feedingAlerts
```

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 86 home feeding alerts"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
