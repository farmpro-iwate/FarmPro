# Starter Pack 135 分娩記録に繁殖記録IDを持たせる準備 確認手順

## 1. 内容

分娩記録に、繁殖記録との連携準備項目を追加します。

追加項目:

```text
breedingId
breedingLinked
breedingLinkedAt
```

---

## 2. 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack135_分娩記録に繁殖記録ID追加_確認手順.md
README_StarterPack135_CalvingBreedingLinkFields.md
```

---

## 3. 手動追記

今回は不要です。

---

## 4. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 5. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 6. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 7. 分娩記録一覧を開く

```text
http://localhost:5173/calvings
```

---

## 8. 確認すること

一覧に以下が表示されればOKです。

```text
繁殖記録
未連携
IDあり・未連携
連携済み
```

今回は、まだ繁殖記録を自動更新しません。

---

## 9. 編集画面を開く

一覧の「編集」を押します。

編集画面に以下が表示されればOKです。

```text
繁殖記録との連携準備
関連する繁殖記録ID
繁殖記録連携状況
```

---

## 10. 繁殖記録IDを入れて保存

例:

```text
関連する繁殖記録ID: 1
```

保存後、一覧に戻ります。

---

## 11. API確認

```text
http://localhost:4000/api/calvings
```

以下が入っていればOKです。

```json
"breedingId": "1",
"breedingLinked": false,
"breedingLinkedAt": ""
```

---

## 12. summary確認

```text
http://localhost:4000/api/calvings/summary
```

以下が出ればOKです。

```text
notLinkedToBreeding
```

---

## 13. 今回まだやらないこと

```text
繁殖記録を分娩済みにする
繁殖記録候補を自動検索する
繁殖画面側を更新する
```

これらは次以降のPackで進めます。

---

## 14. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 135 calving breeding link fields"
git push
```
