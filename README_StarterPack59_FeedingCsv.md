# FarmPro Starter Pack 59 飼料給与 CSV出力版

## 内容

Starter Pack 59では、飼料給与管理にCSV出力機能を追加します。

## 更新ファイル

- client/src/pages/FeedingList.tsx
- docs/StarterPack59_飼料給与CSV出力_確認手順.md
- README_StarterPack59_FeedingCsv.md

## 手動追記

今回は不要です。

## 追加されること

- 飼料給与一覧に「CSV出力」ボタンを追加
- 検索・絞り込み後の表示データだけCSV出力
- Excelで開ける文字化け対策
- CSVファイル名に日付を付ける

## 出力ファイル名

例:

```text
farmpro_feedings_20260703.csv
```

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 59 feeding csv"
git push
```
