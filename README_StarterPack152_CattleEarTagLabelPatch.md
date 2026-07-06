# FarmPro Starter Pack 152 牛台帳まわりID表示を耳標番号へ安全置換

## 内容

牛台帳まわりの画面表示を、耳標番号中心に置き換えます。

## 追加ファイル

```text
tools/apply_cattle_ear_tag_label_patch.js
tools/restore_cattle_ear_tag_label_patch.js
tools/check_cattle_ear_tag_label_patch.js
docs/StarterPack152_牛台帳まわりID表示を耳標番号へ安全置換_手順.md
README_StarterPack152_CattleEarTagLabelPatch.md
```

## 手動追記

不要です。

## 実行コマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\apply_cattle_ear_tag_label_patch.js
```

## 確認URL

```text
http://localhost:5173/cattle
http://localhost:5173/
```

## 戻すコマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\restore_cattle_ear_tag_label_patch.js
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
git commit -m "Patch cattle display labels to ear tag"
git push
```
