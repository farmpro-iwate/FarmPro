# FarmPro Starter Pack 88 ホーム注意子牛リストCSV出力 追加版

## 内容

Starter Pack 88では、ホーム画面の注意子牛リストにCSV出力機能を追加します。

## 更新ファイル

- client/src/pages/Home.tsx
- docs/StarterPack88_ホーム注意子牛リストCSV出力_確認手順.md
- README_StarterPack88_HomeAlertCalfCsv.md

## 手動追記

今回は不要です。

## 追加されること

- ホーム注意子牛リストCSV出力
- 子牛名
- 生年月日
- 日齢
- 近い給与目安
- 直近実績日
- 不足件数
- 多め件数
- 良好件数
- 注意メモ

## 使用するAPI

```text
GET /api/reports/summary
```

## 確認URL

```text
http://localhost:5173
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 88 home alert calf csv"
git push
```
