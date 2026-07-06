# Starter Pack 102 対応記録期限アラート server集計 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. serverを起動し直す

server側の黒い画面で一度止めます。

```text
Ctrl + C
```

その後、起動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

## 5. 確認すること

JSONの中に以下があればOKです。

```text
feedingAlertActionDueAlerts
```

さらに中に以下があれば成功です。

```text
overdueCount
todayCount
soonCount
recheckCount
notStartedCount
totalAttentionCount
details
```

## 6. 件数が0の場合

次回確認日や状態によっては0件でも正常です。

テストする場合は、対応記録の編集画面で以下のようにします。

```text
状態：未対応
次回確認日：昨日の日付
```

または、

```text
状態：再確認必要
```

その後、APIを再読み込みしてください。

## 7. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 102 feeding alert action due server"
git push
```

## 8. エラーになった場合

reports.ts の更新で問題が出た可能性があります。

戻す場合:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
