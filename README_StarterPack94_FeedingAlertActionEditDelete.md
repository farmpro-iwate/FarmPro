# FarmPro Starter Pack 94 給与アラート対応記録 編集・削除 追加版

## 内容

Starter Pack 94では、給与アラート対応記録の編集・削除機能を追加します。

Starter Pack 91で追加した server API を使って、一覧画面から対応記録を編集・削除できるようにします。

## 追加・更新ファイル

- client/src/services/feedingAlertActionsApi.ts
- client/src/pages/FeedingAlertActionList.tsx
- client/src/pages/FeedingAlertActionEditForm.tsx
- docs/StarterPack94_給与アラート対応記録編集削除_確認手順.md
- README_StarterPack94_FeedingAlertActionEditDelete.md

## 手動追記

今回は新しい編集画面を追加するため、以下に追記が必要です。

- client/src/App.tsx

## 追加される画面

```text
/feeding-alert-actions/:id/edit
```

## 使うAPI

```text
GET    /api/feeding-alert-actions/:id
PUT    /api/feeding-alert-actions/:id
DELETE /api/feeding-alert-actions/:id
```

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 94 feeding alert action edit delete"
git push
```
