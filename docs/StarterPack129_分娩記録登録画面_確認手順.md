# Starter Pack 129 分娩記録 登録画面 確認手順

## 1. 内容

分娩記録を登録する画面を追加します。

追加ファイル:

```text
client/src/services/calvingsApi.ts
client/src/pages/CalvingForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack129_分娩記録登録画面_確認手順.md
README_StarterPack129_CalvingCreate.md
```

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 前提

Starter Pack 128 の server API が反映済みであること。

Chromeで以下が表示されること。

```text
http://localhost:4000/api/calvings
```

---

## 4. App.tsxに追記する

`client/src/App.tsx` を開きます。

### import欄に追加

```ts
import { CalvingForm } from './pages/CalvingForm';
import { CalvingList } from './pages/CalvingList';
```

### Route欄に追加

```tsx
<Route path="/calvings" element={<AppLayout><CalvingList /></AppLayout>} />
<Route path="/calvings/new" element={<AppLayout><CalvingForm /></AppLayout>} />
```

他の `<Route ... />` が並んでいるところに入れればOKです。

---

## 5. AppLayoutにメニュー追加する場合

`client/src/components/AppLayout.tsx` にメニューがある場合、任意で追加します。

```ts
{ label: '分娩記録', path: '/calvings' },
```

これは必須ではありません。

---

## 6. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 7. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 8. 登録画面を開く

Chromeで開きます。

```text
http://localhost:5173/calvings/new
```

---

## 9. 入力例

```text
母牛ID: 1
母牛名: サンプル母牛
分娩予定日: 2026-08-01
実分娩日: 2026-07-31
子牛名: サンプル子牛2
性別: メス
出生体重: 31
分娩結果: 正常
初乳確認: 確認済み
メモ: 自然分娩。初乳確認済み。
```

---

## 10. 登録確認

登録後、Chromeで開きます。

```text
http://localhost:4000/api/calvings
```

登録した分娩記録が追加されていればOKです。

---

## 11. 今回できること

```text
分娩記録を登録
予定日との差を画面上で表示
分娩結果を少ない選択肢で入力
初乳確認を少ない選択肢で入力
分娩記録をJSONへ保存
```

---

## 12. 今回まだやらないこと

```text
分娩記録一覧の本格表示
編集
削除
子牛台帳への連携
```

これらは次以降のStarter Packで追加します。

---

## 13. エラーになった場合

### 画面が白い

App.tsxのimportまたはRouteの書き方を確認します。

### 登録できない

serverが起動しているか確認します。

```text
http://localhost:4000/api/calvings
```

### Cannot GET /api/calvings

Pack128のapp.ts追記が抜けています。

```ts
import { calvingsRouter } from './routes/calvings';
app.use('/api/calvings', calvingsRouter);
```

---

## 14. GitHub保存

登録確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 129 calving create page"
git push
```
