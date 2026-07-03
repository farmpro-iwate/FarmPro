# FarmPro Starter Pack 28 出荷・販売一覧画面追加版

## 内容

Starter Pack 28では、出荷・販売管理の「一覧画面」を追加します。

白い画面を避けるため、今回は既存ファイルを自動上書きしません。
新しいファイルだけ追加します。

## 追加ファイル

- client/src/services/salesApi.ts
- client/src/pages/SalesList.tsx
- docs/StarterPack28_出荷販売一覧画面_追加手順.md
- docs/StarterPack28_確認手順.md

## 手動で追加する場所

既存ファイルを安全に編集するため、次の2ファイルだけ手動で少し追加します。

- client/src/App.tsx
- client/src/components/AppLayout.tsx

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

画面表示確認ができてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 28 sales list"
git push
```
