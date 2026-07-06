# FarmPro Starter Pack 127 分娩記録 基本設計

## 内容

Starter Pack 127では、分娩記録をFarmProに追加するための基本設計を整理します。

前回の方針どおり、機能を増やしすぎず、まずは実運用で必要な最低限の分娩記録に絞ります。

## 追加ファイル

```text
docs/StarterPack127_分娩記録_基本設計.md
docs/StarterPack127_分娩記録_入力項目整理.md
docs/StarterPack127_分娩から子牛台帳への連携方針.md
docs/StarterPack127_今後の実装ステップ.md
README_StarterPack127_CalvingRecordDesign.md
```

## 手動追記

今回は不要です。

## アプリ画面の変更

今回は docs のみなので、アプリ画面は変わりません。

## 目的

```text
分娩記録の項目を整理する
入力項目を増やしすぎない
分娩後に子牛台帳へつなげる方針を決める
次のserver API追加に備える
```

## 次の候補

```text
Starter Pack 128：分娩記録 server API
Starter Pack 129：分娩記録 登録画面
Starter Pack 130：分娩記録 一覧画面
Starter Pack 131：分娩記録から子牛台帳へ連携
```

## GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 127 calving record design"
git push
```
