# FarmPro Starter Pack 54 飼料給与 一覧画面追加版

## 内容

Starter Pack 54では、飼養管理の第一歩として「飼料給与一覧画面」を追加します。

server APIはStarter Pack 53で追加済みの `/api/feedings` を使います。

## 追加ファイル

- client/src/services/feedingsApi.ts
- client/src/pages/FeedingList.tsx
- docs/StarterPack54_飼料給与一覧画面_確認手順.md
- README_StarterPack54_FeedingList.md

## 手動追記が必要なファイル

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 追加されること

- 飼料給与一覧画面
- 表示件数
- 給与量合計
- 金額合計
- 検索欄
- 給与日、対象、飼料名、給与量、単位、単価、金額、目的、メモの表示

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 54 feeding list"
git push
```
