# Starter Pack 103 ホーム対応記録期限アラート 確認手順

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

## 5. API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

JSONの中に以下があればOKです。

```text
feedingAlertActionDueAlerts
```

## 6. ホーム画面確認

Chromeで開きます。

```text
http://localhost:5173
```

## 7. 確認すること

ホーム画面に以下が表示されれば成功です。

```text
対応記録 期限アラート
期限切れ
今日確認
まもなく確認
再確認必要
未対応
注意が必要な対応記録
```

## 8. 件数が0の場合

以下が表示されれば正常です。

```text
現在、確認が必要な対応記録期限アラートはありません。
```

## 9. テストしたい場合

対応記録の編集画面で以下のようにします。

```text
状態：未対応
次回確認日：昨日の日付
```

または、

```text
状態：再確認必要
```

保存後、ホームを再読み込みしてください。

```text
Ctrl + F5
```

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 103 home feeding alert action due"
git push
```

## 11. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
