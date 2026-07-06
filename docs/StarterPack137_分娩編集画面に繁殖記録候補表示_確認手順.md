# Starter Pack 137 分娩編集画面に繁殖記録候補表示 確認手順

## 1. 内容

分娩記録の編集画面で、関連しそうな繁殖記録候補を表示します。

今回は、候補を選んで `breedingId` を保存するところまでです。

繁殖記録を「分娩済み」にはまだしません。

---

## 2. 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
docs/StarterPack137_分娩編集画面に繁殖記録候補表示_確認手順.md
README_StarterPack137_CalvingBreedingCandidatesUI.md
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

## 8. 編集画面を開く

一覧の「編集」を押します。

---

## 9. 確認すること

編集画面に以下が表示されればOKです。

```text
繁殖記録との連携準備
候補を再検索
繁殖記録候補
この候補を使う
```

---

## 10. 候補を使う

候補が表示されている場合、

```text
この候補を使う
```

を押します。

`関連する繁殖記録ID` にIDが入ればOKです。

そのあと、

```text
分娩記録を更新
```

を押します。

---

## 11. API確認

```text
http://localhost:4000/api/calvings
```

対象の分娩記録に以下が入ればOKです。

```json
"breedingId": "..."
```

---

## 12. 今回まだやらないこと

```text
繁殖記録を分娩済みにする
繁殖記録側のデータを書き換える
繁殖画面側へ表示する
```

これは次のStarter Packで安全に進めます。

---

## 13. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 137 calving breeding candidates UI"
git push
```
