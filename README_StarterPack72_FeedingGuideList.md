# FarmPro Starter Pack 72 飼料給与目安 一覧画面追加版

## 内容

Starter Pack 72では、飼料給与目安表の一覧画面を追加します。

server APIはStarter Pack 71で追加済みの `/api/feeding-guide` を使います。

## 追加ファイル

- client/src/services/feedingGuideApi.ts
- client/src/pages/FeedingGuideList.tsx
- docs/StarterPack72_飼料給与目安一覧画面_確認手順.md
- README_StarterPack72_FeedingGuideList.md

## 手動追記が必要なファイル

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 追加されること

- 飼料給与目安一覧画面
- 日齢
- 月齢
- ステージ
- 体重目安
- 体高目安
- 胸囲目安
- スターター給与量
- 育成配合給与量
- 粗飼料給与量
- その他給与量
- メモ
- 検索欄

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 72 feeding guide list"
git push
```
