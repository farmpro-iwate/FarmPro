# FarmPro Starter Pack 92 給与アラート対応記録 一覧画面 追加版

## 内容

Starter Pack 92では、給与アラート対応記録の一覧画面を追加します。

Starter Pack 91で追加した server API を使って、アプリ画面から対応記録を確認できるようにします。

## 追加ファイル

- client/src/services/feedingAlertActionsApi.ts
- client/src/pages/FeedingAlertActionList.tsx
- docs/StarterPack92_給与アラート対応記録一覧画面_確認手順.md
- README_StarterPack92_FeedingAlertActionList.md

## 手動追記

今回は新しい画面を追加するため、以下に追記が必要です。

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 追加される画面

```text
/feeding-alert-actions
```

## 使うAPI

```text
GET /api/feeding-alert-actions
```

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 92 feeding alert action list"
git push
```
