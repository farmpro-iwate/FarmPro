# 繁殖Farm Pro - Starter Pack 2 修正版（Python不要版）

`better-sqlite3` を使わず、JSONファイル保存方式に変更した修正版です。

## 追加内容
- 牛の新規登録
- 牛の編集
- 牛の削除
- JSONファイル保存
- サーバー再起動後もデータ保持

## データ保存先
server/src/data/cattle.json

## 反映方法
このZIPの中身を、既存の FarmPro フォルダへ上書きコピーしてください。

## 起動
serverフォルダ:
```bash
npm install
npm run dev
```

clientフォルダ:
```bash
npm install
npm run dev
```

## GitHub保存
```bash
git add .
git commit -m "Add Starter Pack 2 JSON cattle CRUD"
git push
```
