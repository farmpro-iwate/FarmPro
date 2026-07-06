# FarmPro Starter Pack 109 給与目安データ変更前バックアップ

## 内容

Starter Pack 109では、給与目安データを実際の表に合わせて変更する前のバックアップ用ファイルと手順を追加します。

## 追加ファイル

- server/src/data/feedingGuide_backup_before_real_data.json
- docs/StarterPack109_給与目安データ変更前バックアップ_確認手順.md
- docs/StarterPack109_給与目安データを戻す手順.md
- README_StarterPack109_FeedingGuideBackup.md

## 手動追記

今回は不要です。

## アプリ画面の変更

バックアップ用ファイル追加なので、アプリ画面は変わりません。

## 大事な注意

このZIPに入っているバックアップファイルは「バックアップ置き場」です。

実際の現在データを完全に保存するには、以下のファイルの中身をコピーします。

```text
server/src/data/feedingGuide.json
```

コピー先:

```text
server/src/data/feedingGuide_backup_before_real_data.json
```

## 次の候補

- Starter Pack 110：給与目安データを実際の表に合わせて更新
- Starter Pack 111：給与目安データ確認画面の見やすさ調整

## GitHub保存

バックアップ後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 109 feeding guide backup"
git push
```
