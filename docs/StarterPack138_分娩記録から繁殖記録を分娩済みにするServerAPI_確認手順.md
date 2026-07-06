# Starter Pack 138 分娩記録から繁殖記録を分娩済みにするServer API 確認手順

## 1. 内容

分娩記録から、関連する繁殖記録を「分娩済み」に更新するserver APIを追加します。

追加API:

```text
POST /api/calvings/:id/complete-breeding
```

今回はserver APIの追加です。

画面ボタンは次のStarter Packで追加します。

---

## 2. 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
docs/StarterPack138_分娩記録から繁殖記録を分娩済みにするServerAPI_確認手順.md
README_StarterPack138_CompleteBreedingServer.md
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

## 6. 事前確認

分娩記録に `breedingId` が入っている必要があります。

```text
http://localhost:4000/api/calvings
```

例:

```json
"breedingId": "1",
"breedingLinked": false
```

---

## 7. APIの動き

このAPIは以下を行います。

```text
分娩記録のbreedingIdを確認
対象の繁殖記録を探す
繁殖記録のstatusを分娩済みにする
繁殖記録に実分娩日・分娩結果・子牛名・分娩記録IDを保存
分娩記録のbreedingLinkedをtrueにする
```

---

## 8. API確認方法

このAPIはPOSTなので、ChromeのURL入力だけでは実行できません。

次のPackで画面ボタンを追加します。

すぐ確認したい場合は、PowerShellで以下のように実行できます。

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4000/api/calvings/calving_sample_001/complete-breeding" -ContentType "application/json" -Body "{}"
```

ただし、`calving_sample_001` の部分は実際の分娩記録IDに置き換えてください。

---

## 9. 確認URL

実行後に確認します。

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

以下のようになればOKです。

```json
"status": "分娩済み"
```

---

## 10. エラー例

### 関連する繁殖記録IDがありません

分娩記録に `breedingId` が入っていません。

### 指定された繁殖記録IDが見つかりません

`breedingId` と一致する繁殖記録がありません。

### すでに繁殖記録と連携済みです

すでに `breedingLinked: true` になっています。

---

## 11. 今回まだやらないこと

```text
画面ボタンの追加
繁殖記録候補の画面選択後に即実行
繁殖画面側の見た目調整
```

---

## 12. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 138 complete breeding server API"
git push
```
