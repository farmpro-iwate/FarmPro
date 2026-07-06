# FarmPro Starter Pack 87 ホームに注意子牛リスト表示 追加版

## 内容

Starter Pack 87では、ホーム画面の給与アラートに「注意子牛リスト」を追加します。

不足気味・多め・実績なしなど、確認が必要な子牛をホームで見つけやすくします。

## 更新ファイル

- client/src/pages/Home.tsx
- docs/StarterPack87_ホーム注意子牛リスト_確認手順.md
- README_StarterPack87_HomeAlertCalfList.md

## 手動追記

今回は不要です。

## 追加されること

- ホーム画面に注意子牛リスト
- 子牛名
- 日齢
- 近い給与目安
- 直近実績日
- 不足件数
- 多め件数
- 注意メモ
- 給与目安画面への導線
- レポート画面への導線

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
git commit -m "Add Starter Pack 87 home alert calf list"
git push
```
