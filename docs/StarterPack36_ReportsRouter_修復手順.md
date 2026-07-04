# Starter Pack 36 ReportsRouter 修復手順

## 原因

server/src/app.ts が次の形で reportsRouter を読み込んでいました。

```ts
import { reportsRouter } from './routes/reports';
```

しかし reports.ts 側が default export だけになっていたため、server が起動できませんでした。

## 修正内容

reports.ts 側で次の形にしました。

```ts
export const reportsRouter = Router();
export default reportsRouter;
```

これで named export と default export の両方に対応します。

## 反映方法

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 確認

serverを起動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

成功表示:

```text
FarmPro server running at http://localhost:4000
```

## API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

英数字のJSONが出ればOKです。
