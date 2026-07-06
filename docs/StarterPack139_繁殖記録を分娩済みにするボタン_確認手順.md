# Starter Pack 139 繁殖記録を分娩済みにするボタン 確認手順

## 1. 内容

分娩記録の編集画面に、繁殖記録を分娩済みにするボタンを追加します。

追加されるボタン:

```text
繁殖記録を分娩済みにする
breedingIdだけ保存
```

---

## 2. 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
docs/StarterPack139_繁殖記録を分娩済みにするボタン_確認手順.md
README_StarterPack139_CompleteBreedingButton.md
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

一覧の「編集」を押します。

---

## 8. 確認すること

編集画面に以下が表示されればOKです。

```text
繁殖記録との連携
繁殖記録を分娩済みにする
breedingIdだけ保存
```

---

## 9. 実行手順

まず候補を選びます。

```text
この候補を使う
```

または、関連する繁殖記録IDを手入力します。

次に、

```text
breedingIdだけ保存
```

を押します。

最後に、

```text
繁殖記録を分娩済みにする
```

を押します。

確認メッセージが出るので、内容が正しければOKを押します。

---

## 10. API確認

分娩記録:

```text
http://localhost:4000/api/calvings
```

以下になればOKです。

```json
"breedingLinked": true
```

繁殖記録:

```text
http://localhost:4000/api/breedings
```

または、

```text
http://localhost:4000/api/breeding
```

以下になればOKです。

```json
"status": "分娩済み"
```

---

## 11. 注意

このボタンは繁殖記録側を書き換えます。

押す前に確認してください。

```text
母牛
分娩予定日
実分娩日
分娩結果
子牛名
```

---

## 12. すでに連携済みの場合

すでに連携済みの場合は、ボタンが押せなくなります。

```text
繁殖記録連携状況: 連携済み
```

---

## 13. エラーになった場合

### 関連する繁殖記録IDがありません

候補を選ぶか、breedingIdを入力してください。

### 指定された繁殖記録IDが見つかりません

入力したbreedingIdが繁殖記録に存在しません。

### すでに繁殖記録と連携済みです

すでに処理済みです。

---

## 14. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 139 complete breeding button"
git push
```
