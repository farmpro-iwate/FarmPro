# FarmPro Starter Pack 154 残った古い番号表示を耳標番号へ修正

## 内容

番号表示の全体確認で残っていた古い表示を、耳標番号中心に修正します。

## 対象ファイル

```text
client/src/pages/BlvList.tsx
client/src/pages/BreedingList.tsx
client/src/pages/HelpPage.tsx
client/src/components/CattlePicker.tsx
```

## 追加ファイル

```text
tools/apply_final_number_label_patch.js
tools/restore_final_number_label_patch.js
docs/StarterPack154_残った番号表示を耳標番号へ修正_手順.md
README_StarterPack154_FinalNumberLabelPatch.md
```

## 手動追記

不要です。

## 実行コマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\apply_final_number_label_patch.js
```

## 確認コマンド

```bash
node tools\check_number_label_final.js
```

## 戻すコマンド

```bash
node tools\restore_final_number_label_patch.js
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Patch remaining number labels to ear tag"
git push
```
