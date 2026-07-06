# FarmPro Starter Pack 91 給与アラート対応記録 server API 追加版

## 内容

Starter Pack 91では、給与アラート対応記録の server API を追加します。

## 追加・更新ファイル

- server/src/data/feedingAlertActions.json
- server/src/routes/feedingAlertActions.ts
- docs/StarterPack91_給与アラート対応記録ServerAPI_確認手順.md
- README_StarterPack91_FeedingAlertActionServer.md

## 手動追記

今回は `server/src/app.ts` に追記が必要です。

## 追加するAPI

```text
GET    /api/feeding-alert-actions
GET    /api/feeding-alert-actions/:id
POST   /api/feeding-alert-actions
PUT    /api/feeding-alert-actions/:id
DELETE /api/feeding-alert-actions/:id
```

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 91 feeding alert action server"
git push
```
