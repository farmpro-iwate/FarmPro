# FarmPro Starter Pack 150 子牛台帳まわりID表示を耳標番号へ安全置換

## 内容

子牛台帳まわりの画面表示を、耳標番号中心に置き換えます。

## 追加ファイル

```text
tools/apply_calf_ear_tag_label_patch.js
tools/restore_calf_ear_tag_label_patch.js
tools/check_calf_ear_tag_label_patch.js
docs/StarterPack150_子牛台帳まわりID表示を耳標番号へ安全置換_手順.md
README_StarterPack150_CalfEarTagLabelPatch.md
```

## 手動追記

不要です。

## 実行コマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\apply_calf_ear_tag_label_patch.js
```

## 確認URL

```text
http://localhost:5173/calves
http://localhost:5173/calvings
```

## 戻すコマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\restore_calf_ear_tag_label_patch.js
```

## 方針

```text
画面表示だけを耳標番号中心に直す
内部データ名は変えない
白画面になったら戻せるようにする
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Patch calf display labels to ear tag"
git push
```
