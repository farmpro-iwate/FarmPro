# FarmPro Starter Pack 135 分娩記録に繁殖記録IDを持たせる準備

## 内容

Starter Pack 135では、分娩記録に繁殖記録との連携準備項目を追加します。

## 追加・更新項目

```text
breedingId
breedingLinked
breedingLinkedAt
```

## 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack135_分娩記録に繁殖記録ID追加_確認手順.md
README_StarterPack135_CalvingBreedingLinkFields.md
```

## 手動追記

不要です。

## 確認URL

```text
http://localhost:5173/calvings
```

編集画面:

```text
http://localhost:5173/calvings/分娩記録ID/edit
```

## API確認

```text
http://localhost:4000/api/calvings
http://localhost:4000/api/calvings/summary
```

## 今回まだやらないこと

```text
繁殖記録を分娩済みにする
繁殖記録候補を自動検索する
繁殖画面側を更新する
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 135 calving breeding link fields"
git push
```
