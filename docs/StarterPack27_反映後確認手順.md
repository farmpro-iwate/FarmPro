# Starter Pack 27 反映後確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 追加ファイルを確認する

次の2つがあるか確認します。

```text
server/src/data/sales.json
server/src/routes/sales.ts
```

## 3. server/src/index.ts に2行追加する

安全のため、Starter Pack 27では index.ts を自動上書きしていません。

手動で次の2行を追加します。

### import の場所

他の import が並んでいる場所に追加します。

```ts
import salesRouter from './routes/sales';
```

### app.use の場所

他の `app.use('/api/...', ...);` が並んでいる場所に追加します。

```ts
app.use('/api/sales', salesRouter);
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
http://localhost:4000/api/sales
```

最初は空なので、次のように表示されればOKです。

```json
[]
```

## 6. client確認

clientは今回変更していないので、通常通り起動できればOKです。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

Chrome:

```text
http://localhost:5173
```

## 7. GitHub保存

server起動とAPI確認ができたら保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 27 sales server"
git push
```

## 注意

白い画面になった場合は、今回の変更ではなく別の変更が残っている可能性があります。
その場合は Git で戻してください。
