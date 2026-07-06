# FarmPro Starter Pack 77 子牛カルテに給与目安表示 追加版

## 内容

Starter Pack 77では、子牛カルテ画面に給与目安表示を追加します。

子牛の生年月日から日齢を自動計算し、飼料給与目安表から一番近い目安を表示します。

## 更新ファイル

- client/src/pages/CalfDetail.tsx
- docs/StarterPack77_子牛カルテ給与目安表示_確認手順.md
- README_StarterPack77_CalfDetailFeedingGuide.md

## 手動追記

今回は不要です。

## 追加されること

- 子牛カルテに給与目安エリアを追加
- 生年月日から日齢を自動計算
- 日齢に近い給与目安を自動取得
- 体重目安
- 体高目安
- 胸囲目安
- スターター給与量
- 育成配合給与量
- 粗飼料給与量
- その他給与量
- メモ表示

## 使用するAPI

```text
GET /api/calves/:id
GET /api/feeding-guide/nearest/:ageDays
```

## 注意

現在のプロジェクトの子牛カルテ画面ファイルが `client/src/pages/CalfDetail.tsx` ではない場合は、反映後に白い画面になる可能性があります。

その場合は、元に戻してから実際のファイル名に合わせて修正版を作ります。

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 77 calf detail feeding guide"
git push
```
