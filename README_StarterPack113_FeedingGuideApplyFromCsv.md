# FarmPro Starter Pack 113 変換後JSONを給与目安へ本反映

## 内容

Starter Pack 113では、CSVから変換した給与目安JSONを、FarmPro本体の給与目安データへ反映する安全スクリプトを追加します。

## 追加ファイル

- tools/apply_feeding_guide_from_csv.js
- docs/StarterPack113_給与目安JSON本反映_確認手順.md
- docs/StarterPack113_給与目安本反映後チェック.md
- README_StarterPack113_FeedingGuideApplyFromCsv.md

## 入力ファイル

```text
server/src/data/feedingGuide_from_csv.json
```

## 本番反映先

```text
server/src/data/feedingGuide.json
```

## 自動バックアップ

反映前に、現在の `feedingGuide.json` を以下へ自動バックアップします。

```text
server/src/data/feedingGuide_backup_auto_YYYYMMDD_HHMMSS.json
```

## 手動追記

今回は不要です。

## アプリ画面の変更

今回はスクリプト追加なので、アプリ画面は変わりません。

## 実行コマンド

プロジェクト本体で実行します。

```bash
node tools/apply_feeding_guide_from_csv.js
```

## GitHub保存

反映確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Apply feeding guide from csv"
git push
```
