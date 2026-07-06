# Starter Pack 86 修正版 ホーム給与アラート集計 確認手順

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

## 4. clientを起動し直す

client側の黒い画面で一度止めます。

```text
Ctrl + C
```

その後、もう一度起動します。

```bash
npm run dev
```

## 5. ホーム画面を開く

```text
http://localhost:5173
```

## 6. 強制更新

Chromeでホーム画面を開いた状態で押します。

```text
Ctrl + F5
```

## 7. 確認すること

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
git commit -m "Repair Starter Pack 86 home feeding alerts"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
