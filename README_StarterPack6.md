# 繁殖Farm Pro - Starter Pack 6 BLV管理

Starter Pack 6 では、BLV検査管理を追加します。

## 追加内容

- BLV検査記録一覧
- BLV検査記録の新規登録
- BLV検査記録の編集
- BLV検査記録の削除
- 対象牛
- 検査日
- 検査結果：未検査 / 陰性 / 陽性
- 次回検査予定日
- 陽性牛の隔離メモ
- JSON保存

## 保存先

server/src/data/blvTests.json

## 反映方法

このZIPの中身を、既存の FarmPro フォルダへ上書きコピーしてください。

コピー先：

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## 起動方法

serverフォルダ：

npm run dev

clientフォルダ：

npm run dev

## GitHub保存

動作確認後：

git add .
git commit -m "Add Starter Pack 6 BLV management"
git push
