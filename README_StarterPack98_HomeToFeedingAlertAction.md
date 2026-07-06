# FarmPro Starter Pack 98 ホーム注意子牛リストから対応記録追加 追加版

## 内容

Starter Pack 98では、ホーム画面の注意子牛リストから給与アラート対応記録を追加できるようにします。

ホームで注意が必要な子牛を見つけたら、そのまま「対応記録を追加」ボタンで新規登録画面へ移動できます。

## 更新ファイル

- client/src/pages/Home.tsx
- client/src/pages/FeedingAlertActionForm.tsx
- docs/StarterPack98_ホームから対応記録追加_確認手順.md
- README_StarterPack98_HomeToFeedingAlertAction.md

## 手動追記

今回は不要です。

## 追加されること

- ホーム注意子牛リストに「対応記録」ボタン
- 子牛名を新規登録画面へ引き継ぎ
- 日齢を新規登録画面へ引き継ぎ
- 注意メモからアラート種別を自動推定
- 新規登録画面に引き継ぎ表示

## 使う画面

```text
http://localhost:5173
http://localhost:5173/feeding-alert-actions/new
```

## GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 98 home to feeding alert action"
git push
```
