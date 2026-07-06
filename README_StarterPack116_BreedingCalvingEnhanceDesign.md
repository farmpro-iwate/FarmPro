# FarmPro Starter Pack 116 繁殖・種付・受精卵移植・分娩管理 強化設計

## 内容

Starter Pack 116では、FarmProの繁殖管理を本格的に強化するための設計ドキュメントを追加します。

現在の繁殖管理は、種付日と分娩予定日を中心とした最低限の管理です。

今後は以下を扱えるようにしていきます。

```text
人工授精 AI
自然交配
受精卵移植 ET
妊娠鑑定
不受胎・再発情
分娩記録
子牛台帳との連携
```

## 追加ファイル

- docs/StarterPack116_繁殖分娩管理強化_基本設計.md
- docs/StarterPack116_種付受精卵移植_入力項目整理.md
- docs/StarterPack116_分娩記録_入力項目整理.md
- docs/StarterPack116_今後の実装ステップ.md
- README_StarterPack116_BreedingCalvingEnhanceDesign.md

## 手動追記

今回は不要です。

## アプリ画面の変更

今回は docs のみなので、アプリ画面は変わりません。

## 目的

- 繁殖管理を実運用に近づける
- 受精卵移植を管理できるようにする
- 分娩記録を強化する
- 分娩後に子牛台帳へつなげる流れを作る
- 将来のserver/API/画面追加に備える

## 次の候補

- Starter Pack 117：繁殖記録 server API 強化
- Starter Pack 118：種付・受精卵移植 登録画面
- Starter Pack 119：分娩記録 server API
- Starter Pack 120：分娩記録 登録画面
- Starter Pack 121：分娩後に子牛台帳へ連携

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 116 breeding calving enhance design"
git push
```
