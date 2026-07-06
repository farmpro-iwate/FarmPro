# Starter Pack 71 飼料給与目安 server API 確認手順

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
import { feedingGuideRouter } from './routes/feedingGuide';
```

### 追加2：app.use の近くに追加

```ts
app.use('/api/feeding-guide', feedingGuideRouter);
```

## 3. 追加位置の例

routes import が並んでいる場所に追加します。

```ts
import { feedInventoryRouter } from './routes/feedInventory';
import { feedingGuideRouter } from './routes/feedingGuide';
```

app.use が並んでいる場所に追加します。

```ts
app.use('/api/feed-inventory', feedInventoryRouter);
app.use('/api/feeding-guide', feedingGuideRouter);
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
http://localhost:4000/api/feeding-guide
```

0日、30日、60日などのデータが表示されればOKです。

## 6. 日齢から近い目安を確認

Chromeで次を開きます。

```text
http://localhost:4000/api/feeding-guide/nearest/92
```

90日付近の目安が表示されればOKです。

## 7. 追加される項目

```text
ageDays
ageMonth
stageName
targetWeight
targetHeight
targetChest
starterAmount
growingFeedAmount
roughageAmount
otherAmount
memo
```

## 8. エラーになった場合

### Cannot find module './routes/feedingGuide' の場合

ファイルのコピー先が間違っている可能性があります。

正しい場所:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server\src\routes\feedingGuide.ts
```

### app.tsの追記ミスの場合

追加した2行を確認してください。

```ts
import { feedingGuideRouter } from './routes/feedingGuide';
app.use('/api/feeding-guide', feedingGuideRouter);
```

### EADDRINUSE の場合

serverがすでに起動しています。
Chromeで `http://localhost:4000/api/feeding-guide` を確認してください。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 71 feeding guide server API"
git push
```

## 10. serverエラーで戻したい場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
