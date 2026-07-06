# FarmPro Starter Pack 134 分娩記録と繁殖記録の連携方針

## 内容

Starter Pack 134では、分娩記録と繁殖記録をどうつなげるか整理します。

今回は docs のみです。

既存の繁殖管理画面・子牛管理画面・分娩記録画面は変更しません。

## 追加ファイル

```text
docs/StarterPack134_分娩記録と繁殖記録の連携方針.md
docs/StarterPack134_繁殖記録を分娩済みにする考え方.md
docs/StarterPack134_安全な連携実装ステップ.md
README_StarterPack134_CalvingBreedingLinkDesign.md
```

## 手動追記

不要です。

## アプリ画面の変更

ありません。

## 方針

```text
分娩記録を登録
子牛台帳へ登録
確認ボタンで繁殖記録を分娩済みにする
自動で勝手に繁殖記録を書き換えない
```

## 次の候補

```text
Starter Pack 135：分娩記録に繁殖記録IDを持たせる準備
Starter Pack 136：分娩記録から繁殖記録を分娩済みにするserver API
Starter Pack 137：分娩記録一覧に繁殖記録更新ボタン追加
```

## GitHub保存

docsのみなので、反映後に保存してOKです。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 134 calving breeding link design"
git push
```
