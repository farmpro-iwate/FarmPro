# Starter Pack 62 飼料在庫 server API 確認手順

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
import { feedInventoryRouter } from './routes/feedInventory';
```

### 追加2：app.use の近くに追加

```ts
app.use('/api/feed-inventory', feedInventoryRouter);
```

## 3. 追加位置の例

app.ts の routes import が並んでいる場所に追加します。

```ts
import { feedingsRouter } from './routes/feedings';
import { feedInventoryRouter } from './routes/feedInventory';
```

app.use が並んでいる場所に追加します。

```ts
app.use('/api/feedings', feedingsRouter);
app.use('/api/feed-inventory', feedInventoryRouter);
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
http://localhost:4000/api/feed-inventory
```

最初は次のように表示されればOKです。

```json
[]
```

## 6. 追加される項目

```text
transactionDate
feedName
transactionType
quantity
unit
unitPrice
totalPrice
supplier
memo
```

## 7. エラーになった場合

### Cannot find module './routes/feedInventory' の場合

ファイルのコピー先が間違っている可能性があります。

正しい場所:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\routes\feedInventory.ts
```

### app.tsの追記ミスの場合

追加した2行を確認してください。

```ts
import { feedInventoryRouter } from './routes/feedInventory';
app.use('/api/feed-inventory', feedInventoryRouter);
```

### EADDRINUSE の場合

serverがすでに起動しています。
Chromeで `http://localhost:4000/api/feed-inventory` を確認してください。

## 8. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 62 feed inventory server API"
git push
```

## 9. serverエラーで戻したい場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
