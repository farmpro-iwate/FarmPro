# Starter Pack 127 今後の実装ステップ

## 1. 目的

分娩記録をFarmProに入れるための実装順序を整理します。

---

## 2. Starter Pack 128

## 分娩記録 server API

追加候補:

```text
server/src/data/calvings.json
server/src/routes/calvings.ts
```

API候補:

```text
GET /api/calvings
GET /api/calvings/:id
POST /api/calvings
PUT /api/calvings/:id
DELETE /api/calvings/:id
```

app.ts追記候補:

```ts
import { calvingsRouter } from './routes/calvings';
app.use('/api/calvings', calvingsRouter);
```

---

## 3. Starter Pack 129

## 分娩記録 登録画面

追加候補:

```text
client/src/pages/CalvingForm.tsx
client/src/services/calvingsApi.ts
```

URL候補:

```text
/calvings/new
```

---

## 4. Starter Pack 130

## 分娩記録 一覧画面

追加候補:

```text
client/src/pages/CalvingList.tsx
```

URL候補:

```text
/calvings
```

---

## 5. Starter Pack 131

## 子牛台帳へ連携

内容:

```text
分娩記録から子牛台帳へ登録
母牛と子牛をひも付け
二重登録防止
登録済み表示
```

---

## 6. Starter Pack 132

## ホームまたは繁殖画面との連携

内容:

```text
分娩予定日が近い記録を表示
分娩済み記録を表示
子牛台帳未登録の分娩記録を表示
```

ただし、アラートは増やしすぎないように注意します。

---

## 7. 実装時の注意

分娩記録も、既存画面を壊さない方針で進めます。

```text
既存の子牛管理は触らない
既存の繁殖管理は触らない
まず /calvings の別画面で作る
確認できてから連携する
```

---

## 8. ステータスを増やさない

分娩結果は最初は少なくします。

```text
正常
要確認
死産
中止
```

---

## 9. 次に進むおすすめ

次はこれです。

```text
Starter Pack 128：分娩記録 server API
```

---

## 10. 結論

分娩記録はFarmProの中核です。

ただし、一気に子牛台帳まで自動連携せず、段階的に安全に進めます。
