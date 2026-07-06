# FarmPro Starter Pack 102 対応記録期限アラート server集計 追加版

## 内容

Starter Pack 102では、給与アラート対応記録の期限アラート集計を server のレポートAPIに追加します。

## 更新ファイル

- server/src/routes/reports.ts
- docs/StarterPack102_対応記録期限アラートServer集計_確認手順.md
- README_StarterPack102_FeedingAlertActionDueServer.md

## 手動追記

今回は不要です。

## 追加される集計

```text
feedingAlertActionDueAlerts
```

中身:

```text
期限切れ
今日確認
まもなく確認
再確認必要
未対応
注意件数
注意が必要な対応記録一覧
```

## 確認URL

```text
http://localhost:4000/api/reports/summary
```

JSONの中に `feedingAlertActionDueAlerts` があればOKです。

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 102 feeding alert action due server"
git push
```
