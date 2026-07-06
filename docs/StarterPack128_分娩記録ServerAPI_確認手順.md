# Starter Pack 128 分娩記録 server API 確認手順

## 1. 内容

分娩記録を保存するserver APIを追加します。

追加ファイル:

```text
server/src/data/calvings.json
server/src/routes/calvings.ts
docs/StarterPack128_分娩記録ServerAPI_確認手順.md
README_StarterPack128_CalvingServer.md
```

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. app.tsに追記する

`server/src/app.ts` を開きます。

### import欄に追加

```ts
import { calvingsRouter } from './routes/calvings';
```

### app.use欄に追加

```ts
app.use('/api/calvings', calvingsRouter);
```

場所は、他の `app.use('/api/...')` が並んでいるところで大丈夫です。

---

## 4. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

成功表示:

```text
FarmPro server running at http://localhost:4000
```

---

## 5. API確認

Chromeで開きます。

```text
http://localhost:4000/api/calvings
```

サンプルの分娩記録JSONが表示されればOKです。

---

## 6. summary確認

Chromeで開きます。

```text
http://localhost:4000/api/calvings/summary
```

以下のような集計が出ればOKです。

```json
{
  "total": 1,
  "normal": 1,
  "needCheck": 0,
  "stillbirth": 0,
  "stopped": 0,
  "colostrumChecked": 1,
  "notRegisteredToCalfLedger": 1
}
```

---

## 7. 追加されるAPI

```text
GET    /api/calvings
GET    /api/calvings/summary
GET    /api/calvings/:id
POST   /api/calvings
PUT    /api/calvings/:id
DELETE /api/calvings/:id
```

---

## 8. 保存される主な項目

```text
母牛ID
母牛名
分娩予定日
実分娩日
予定日との差
子牛名
性別
出生体重
分娩結果
初乳確認
メモ
子牛台帳登録済みフラグ
```

---

## 9. 既存画面確認

今回はserver APIだけなので、アプリ画面は変わりません。

念のため以下が開けばOKです。

```text
http://localhost:5173
http://localhost:5173/calves
http://localhost:5173/breedings
```

---

## 10. エラーになった場合

### `Cannot find module './routes/calvings'`

`server/src/routes/calvings.ts` が正しい場所にコピーされていません。

### `calvingsRouter is not defined`

app.tsのimportが抜けています。

```ts
import { calvingsRouter } from './routes/calvings';
```

### `Cannot GET /api/calvings`

app.tsのapp.useが抜けています。

```ts
app.use('/api/calvings', calvingsRouter);
```

---

## 11. GitHub保存

API確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 128 calving server API"
git push
```
