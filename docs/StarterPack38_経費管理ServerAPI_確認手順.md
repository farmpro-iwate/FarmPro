# Starter Pack 38 経費管理 server API 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. server/src/app.ts に手動追記する

以下の2行を追加します。

### 追加1：importの近くに追加

```ts
import expensesRouter from './routes/expenses';
```

### 追加2：app.use の近くに追加

```ts
app.use('/api/expenses', expensesRouter);
```

## 3. 追加位置の例

app.ts の上のほうに routes の import が並んでいます。
そこに追加します。

```ts
import reportsRouter from './routes/reports';
import expensesRouter from './routes/expenses';
```

app.use が並んでいる場所に追加します。

```ts
app.use('/api/reports', reportsRouter);
app.use('/api/expenses', expensesRouter);
```

## 4. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

成功表示:

```text
FarmPro server running at http://localhost:4000
```

## 5. API確認

Chromeで次を開きます。

```text
http://localhost:4000/api/expenses
```

最初は次のように表示されればOKです。

```json
[]
```

## 6. エラーになった場合

### Failed to fetch の場合

serverが起動していない可能性があります。
serverの黒い画面を確認してください。

### Cannot find module './routes/expenses' の場合

ファイルのコピー先が間違っている可能性があります。

正しい場所:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\routes\expenses.ts
```

### app.tsの追記ミスの場合

追加した2行を確認してください。

```ts
import expensesRouter from './routes/expenses';
app.use('/api/expenses', expensesRouter);
```

## 7. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 38 expense server API"
git push
```

## 8. 白い画面・serverエラーで戻したい場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
