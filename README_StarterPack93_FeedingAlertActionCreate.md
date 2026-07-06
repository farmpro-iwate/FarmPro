# FarmPro Starter Pack 93 給与アラート対応記録 新規登録画面 追加版

## 内容

Starter Pack 93では、給与アラート対応記録の新規登録画面を追加します。

Starter Pack 91で追加した server API を使って、アプリ画面から対応記録を登録できるようにします。

## 追加・更新ファイル

- client/src/services/feedingAlertActionsApi.ts
- client/src/pages/FeedingAlertActionList.tsx
- client/src/pages/FeedingAlertActionForm.tsx
- docs/StarterPack93_給与アラート対応記録新規登録_確認手順.md
- README_StarterPack93_FeedingAlertActionCreate.md

## 手動追記

今回は新しい画面を追加するため、以下に追記が必要です。

- client/src/App.tsx

## 追加される画面

```text
/feeding-alert-actions/new
```

## 使うAPI

```text
POST /api/feeding-alert-actions
```

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 93 feeding alert action create"
git push
```
