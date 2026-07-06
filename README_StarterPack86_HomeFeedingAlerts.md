# FarmPro Starter Pack 86 ホームに給与アラート集計表示 追加版

## 内容

Starter Pack 86では、ホーム画面に給与アラート集計を表示します。

不足気味・多め・実績なしの子牛数をホームで確認できるようにし、レポート画面・給与目安画面へ移動しやすくします。

## 更新ファイル

- client/src/pages/HomePage.tsx
- docs/StarterPack86_ホーム給与アラート集計_確認手順.md
- README_StarterPack86_HomeFeedingAlerts.md

## 手動追記

今回は不要です。

## 追加されること

- ホーム画面に給与アラート集計カード
- 全子牛数
- 不足気味の子牛数
- 多めの子牛数
- 実績なし子牛数
- レポート画面へのボタン
- 給与目安画面へのボタン

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
git commit -m "Add Starter Pack 86 home feeding alerts"
git push
```
