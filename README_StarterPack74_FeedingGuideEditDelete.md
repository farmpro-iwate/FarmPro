# FarmPro Starter Pack 74 飼料給与目安 編集・削除機能追加版

## 内容

Starter Pack 74では、飼料給与目安表に編集・削除機能を追加します。

## 追加・更新ファイル

- client/src/pages/FeedingGuideEditForm.tsx
- client/src/pages/FeedingGuideList.tsx
- client/src/services/feedingGuideApi.ts
- docs/StarterPack74_飼料給与目安編集削除_確認手順.md
- README_StarterPack74_FeedingGuideEditDelete.md

## 手動追記が必要なファイル

- client/src/App.tsx

## 追加されること

- 飼料給与目安一覧に「編集」ボタンを追加
- 飼料給与目安編集画面
- 既存データの読み込み
- 修正して保存
- 飼料給与目安一覧に「削除」ボタンを追加
- 確認メッセージ後に削除
- 削除後に一覧を再読み込み

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 74 feeding guide edit delete"
git push
```
