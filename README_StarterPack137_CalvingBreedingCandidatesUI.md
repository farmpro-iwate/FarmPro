# FarmPro Starter Pack 137 分娩編集画面に繁殖記録候補表示

## 内容

Starter Pack 137では、分娩記録の編集画面で関連しそうな繁殖記録候補を表示します。

## 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
docs/StarterPack137_分娩編集画面に繁殖記録候補表示_確認手順.md
README_StarterPack137_CalvingBreedingCandidatesUI.md
```

## 手動追記

不要です。

## 確認URL

```text
http://localhost:5173/calvings
```

一覧の編集ボタンから確認します。

## できること

```text
繁殖記録候補を表示
候補点を表示
候補理由を表示
この候補を使うボタンでbreedingIdを入力
分娩記録へbreedingIdを保存
```

## 今回まだやらないこと

```text
繁殖記録を分娩済みにする
繁殖記録側のデータを書き換える
繁殖画面側へ表示する
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 137 calving breeding candidates UI"
git push
```
