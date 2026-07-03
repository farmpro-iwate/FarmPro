# FarmPro Starter Pack 29 出荷・販売 新規登録画面追加版

## 内容

Starter Pack 29では、出荷・販売管理に「新規登録画面」を追加します。

## 追加・更新ファイル

- client/src/pages/SalesForm.tsx
- client/src/services/salesApi.ts
- docs/StarterPack29_出荷販売新規登録_追加手順.md
- docs/StarterPack29_確認手順.md

## 安全対策

白い画面を避けるため、App.tsx は自動上書きしません。
手動で1行 import と1行 Route を追加します。

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

表示確認・登録確認ができてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 29 sales create"
git push
```
