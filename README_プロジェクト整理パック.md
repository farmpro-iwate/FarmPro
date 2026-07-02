# 繁殖Farm Pro - プロジェクト整理パック Starter Pack 6対応

この整理パックは、Starter Pack 6までの機能を入れたまま、フォルダ構成を正しい形にそろえるためのものです。

## 入っている機能

- ホーム
- 牛台帳
- 子牛管理
- 繁殖管理
- ワクチン管理
- BLV管理
- 登録・編集・削除
- JSON保存
- 日齢計算
- DG計算
- 分娩予定日計算
- ワクチン判定
- BLV判定

## 正しいフォルダ構成

```text
FarmPro_StarterPack1
  └ FarmPro_StarterPack1
      ├ client
      ├ server
      ├ docs
      ├ README_プロジェクト整理パック.md
      └ cleanup_wrong_folders.bat
```

## 反映方法

このZIPの中身を、既存の FarmPro 本体フォルダへ上書きコピーしてください。

コピー先：

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 重要

コピー後、もし以下のような余計なフォルダがある場合は削除してください。

```text
client\server
server\client
```

同梱の `cleanup_wrong_folders.bat` を FarmPro 本体フォルダで実行すると、この2つだけを削除します。

## 起動方法

serverフォルダ：

```bash
npm install
npm run dev
```

clientフォルダ：

```bash
npm install
npm run dev
```

## GitHub保存

動作確認後：

```bash
git add .
git commit -m "Clean up project structure through Starter Pack 6"
git push
```
