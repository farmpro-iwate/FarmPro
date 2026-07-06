# FarmPro Starter Pack 151 牛台帳番号表示 安全確認

## 内容

牛台帳の表示を耳標番号・個体識別番号中心に直す前に、どのファイルを直すべきか確認します。

## 追加ファイル

```text
tools/check_cattle_number_labels.js
docs/StarterPack151_牛台帳番号表示_安全確認手順.md
docs/StarterPack151_牛台帳表示修正方針.md
README_StarterPack151_CattleNumberLabelSafetyCheck.md
```

## 手動追記

不要です。

## 確認コマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_cattle_number_labels.js
```

## 今回は画面変更なし

白画面防止のため、今回は確認だけです。

## 次の候補

```text
Starter Pack 152：牛台帳一覧の表示を耳標番号中心に整理
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add cattle number label safety check"
git push
```
