# Starter Pack 53 飼養管理 server API 確認手順

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
import { feedingsRouter } from './routes/feedings';
```

### 追加2：app.use の近くに追加

```ts
app.use('/api/feedings', feedingsRouter);
```

## 3. 追加位置の例

app.ts の上のほうに routes の import が並んでいます。
そこに追加します。

```ts
import { monthlyBalanceRouter } from './routes/monthlyBalance';
import { feedingsRouter } from './routes/feedings';
```

app.use が並んでいる場所に追加します。

```ts
app.use('/api/monthly-balance', monthlyBalanceRouter);
app.use('/api/feedings', feedingsRouter);
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
http://localhost:4000/api/feedings
```

最初は次のように表示されればOKです。

```json
[]
```

## 6. 追加される項目

```text
feedingDate
target
feedName
amount
unit
unitPrice
totalPrice
purpose
memo
```

## 7. エラーになった場合

### Cannot find module './routes/feedings' の場合

ファイルのコピー先が間違っている可能性があります。

正しい場所:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\routes\feedings.ts
```

### app.tsの追記ミスの場合

追加した2行を確認してください。

```ts
import { feedingsRouter } from './routes/feedings';
app.use('/api/feedings', feedingsRouter);
```

### EADDRINUSE の場合

serverがすでに起動しています。
Chromeで `http://localhost:4000/api/feedings` を確認してください。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 53 feeding server API"
git push
```

## 9. serverエラーで戻したい場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
