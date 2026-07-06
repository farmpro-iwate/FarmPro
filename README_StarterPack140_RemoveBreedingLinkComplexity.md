# FarmPro Starter Pack 140 繁殖連携を完全シンプル化

## 内容

分娩記録画面から、繁殖記録連携まわりを撤去します。

## 消すもの

```text
繁殖記録候補の表示
この候補を使う
breedingIdだけ保存
繁殖記録を分娩済みにする
繁殖未連携表示
繁殖記録ID表示
```

## 残すもの

```text
分娩記録一覧
分娩記録編集
分娩記録削除
子牛台帳へ登録
```

## 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
client/src/services/calvingsApi.ts
tools/check_breeding_link_changes.js
docs/StarterPack140_繁殖連携を完全シンプル化_確認手順.md
README_StarterPack140_RemoveBreedingLinkComplexity.md
```

## 手動追記

不要です。

## 確認URL

```text
http://localhost:5173/calvings
```

## 書き換わったか確認するコマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_breeding_link_changes.js
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Simplify calving screens remove breeding link complexity"
git push
```
