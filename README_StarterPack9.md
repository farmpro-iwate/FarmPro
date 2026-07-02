# 繁殖Farm Pro - Starter Pack 9 治療管理

Starter Pack 9 では、牛の治療・投薬管理を追加します。

## 追加内容

- 治療管理メニュー
- 治療記録一覧
- 治療記録の新規登録
- 治療記録の編集
- 治療記録の削除
- 対象牛
- 症状
- 診断名
- 治療日
- 使用薬剤
- 投薬量
- 休薬期間終了日
- 獣医師名
- 経過
  - 治療中
  - 経過観察
  - 回復
  - 要再診
- 休薬判定
  - 休薬中
  - 休薬終了
  - 未設定
- JSON保存

## 保存先

server/src/data/treatments.json

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1

## 起動

server:

npm install
npm run dev

client:

npm run dev

## GitHub保存

git add .
git commit -m "Add Starter Pack 9 treatment management"
git push
