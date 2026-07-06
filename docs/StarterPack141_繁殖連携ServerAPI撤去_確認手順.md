# Starter Pack 141 繁殖連携Server API撤去 確認手順

## 1. 内容

分娩記録APIから、繁殖記録連携まわりのserver APIを撤去します。

撤去するAPI:

```text
GET /api/calvings/:id/breeding-candidates
POST /api/calvings/:id/complete-breeding
```

---

## 2. 残すAPI

残すのは、分娩記録と子牛台帳登録に必要なAPIだけです。

```text
GET /api/calvings
GET /api/calvings/summary
GET /api/calvings/:id
POST /api/calvings
PUT /api/calvings/:id
DELETE /api/calvings/:id
POST /api/calvings/:id/register-calf
```

---

## 3. 更新ファイル

```text
server/src/routes/calvings.ts
docs/StarterPack141_繁殖連携ServerAPI撤去_確認手順.md
README_StarterPack141_RemoveBreedingLinkServerApi.md
```

---

## 4. 手動追記

不要です。

---

## 5. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 6. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 7. 通常API確認

Chromeで開きます。

```text
http://localhost:4000/api/calvings
```

分娩記録が表示されればOKです。

summaryも確認します。

```text
http://localhost:4000/api/calvings/summary
```

---

## 8. 撤去確認

以下はもう使いません。

```text
http://localhost:4000/api/calvings/calving_sample_001/breeding-candidates
```

このURLが404またはエラーになればOKです。

---

## 9. 画面確認

clientも起動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

Chromeで開きます。

```text
http://localhost:5173/calvings
```

以下だけが使えればOKです。

```text
分娩記録一覧
分娩記録編集
分娩記録削除
子牛台帳へ登録
```

---

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Remove calving breeding link server APIs"
git push
```
