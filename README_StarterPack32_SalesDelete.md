# FarmPro Starter Pack 32 出荷・販売 削除機能追加版

## 内容

Starter Pack 32では、出荷・販売管理に削除機能を追加します。

## 追加・更新ファイル

- client/src/pages/SalesList.tsx
- client/src/services/salesApi.ts
- docs/StarterPack32_出荷販売削除機能_確認手順.md

## 追加されること

- 出荷・販売一覧に「削除」ボタンを追加
- 削除前に確認メッセージを表示
- 削除後に一覧を自動更新
- server側の DELETE /api/sales/:id を使用

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 32 sales delete"
git push
```
