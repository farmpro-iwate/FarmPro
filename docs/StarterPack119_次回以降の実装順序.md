# Starter Pack 119 次回以降の実装順序

## 1. 次に進める候補

次は以下がおすすめです。

```text
Starter Pack 120：繁殖強化 新規登録専用画面を別URLで追加
```

---

## 2. Starter Pack 120 の内容候補

追加ファイル:

```text
client/src/pages/BreedingAdvancedForm.tsx
client/src/services/breedingAdvancedApi.ts
docs/StarterPack120_繁殖強化新規登録画面_確認手順.md
README_StarterPack120_BreedingAdvancedForm.md
```

App.tsxに追加候補:

```ts
import { BreedingAdvancedForm } from './pages/BreedingAdvancedForm';
```

```tsx
<Route path="/breedings-advanced/new" element={<AppLayout><BreedingAdvancedForm /></AppLayout>} />
```

確認URL:

```text
http://localhost:5173/breedings-advanced/new
```

---

## 3. Starter Pack 121 の内容候補

```text
繁殖強化 一覧確認画面
```

追加ファイル:

```text
client/src/pages/BreedingAdvancedList.tsx
```

確認URL:

```text
http://localhost:5173/breedings-advanced
```

---

## 4. Starter Pack 122 の内容候補

```text
妊娠鑑定管理
```

できること:

```text
鑑定予定日一覧
鑑定結果入力
未鑑定一覧
再確認一覧
不受胎一覧
```

---

## 5. Starter Pack 123 の内容候補

```text
分娩記録 server API
```

追加候補:

```text
server/src/routes/calvings.ts
server/src/data/calvings.json
```

API:

```text
GET /api/calvings
GET /api/calvings/:id
POST /api/calvings
PUT /api/calvings/:id
DELETE /api/calvings/:id
```

---

## 6. Starter Pack 124 の内容候補

```text
分娩記録 登録画面
```

入力項目:

```text
母牛
関連繁殖記録
分娩予定日
実分娩日
分娩結果
子牛名
性別
出生体重
単子/双子
初乳確認
母牛状態
子牛状態
メモ
```

---

## 7. Starter Pack 125 の内容候補

```text
分娩記録から子牛台帳へ連携
```

できること:

```text
分娩記録から子牛台帳へ登録
母牛と子牛をひも付け
二重登録を防ぐ
繁殖記録を分娩済みにする
```

---

## 8. 進め方の注意

画面を触るPackでは、必ず次を守ります。

```text
1. ZIPを反映
2. client起動
3. server起動
4. 直接URLで確認
5. エラーがなければGitHub保存
```

白画面なら、すぐ戻します。

---

## 9. 今回の反省を活かすポイント

```text
既存ファイルを大きく上書きしない
App.tsxの既存URLを変えない
新画面は別URLにする
動いたら少しずつ統合する
```

---

## 10. 結論

次は、既存の繁殖管理を壊さない別画面方式で進めるのが安全です。
