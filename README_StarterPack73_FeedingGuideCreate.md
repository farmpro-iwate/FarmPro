# FarmPro Starter Pack 73 飼料給与目安 新規登録画面追加版

## 内容

Starter Pack 73では、飼料給与目安表に新規登録画面を追加します。

## 追加・更新ファイル

- client/src/pages/FeedingGuideForm.tsx
- client/src/pages/FeedingGuideList.tsx
- client/src/services/feedingGuideApi.ts
- docs/StarterPack73_飼料給与目安新規登録_確認手順.md
- README_StarterPack73_FeedingGuideCreate.md

## 手動追記が必要なファイル

- client/src/App.tsx

## 追加されること

- 飼料給与目安の新規登録画面
- 日齢
- 月齢
- ステージ名
- 体重目安
- 体高目安
- 胸囲目安
- スターター給与量
- 育成配合給与量
- 粗飼料給与量
- その他給与量
- メモ
- 登録後に飼料給与目安一覧へ戻る

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 73 feeding guide create"
git push
```
