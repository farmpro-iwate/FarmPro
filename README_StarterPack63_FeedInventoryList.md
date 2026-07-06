# FarmPro Starter Pack 63 飼料在庫 一覧画面追加版

## 内容

Starter Pack 63では、飼料在庫管理の一覧画面を追加します。

server APIはStarter Pack 62で追加済みの `/api/feed-inventory` を使います。

## 追加ファイル

- client/src/services/feedInventoryApi.ts
- client/src/pages/FeedInventoryList.tsx
- docs/StarterPack63_飼料在庫一覧画面_確認手順.md
- README_StarterPack63_FeedInventoryList.md

## 手動追記が必要なファイル

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 追加されること

- 飼料在庫一覧画面
- 表示件数
- 入庫数量合計
- 出庫数量合計
- 調整数量合計
- 現在在庫の目安
- 検索欄
- 入出庫日、飼料名、区分、数量、単位、単価、金額、仕入先、メモの表示

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 63 feed inventory list"
git push
```
