# FarmPro Starter Pack 36 ReportsRouter Repair

## 内容

server/src/app.ts が次の形で読み込んでいる場合に対応する修正版です。

```ts
import { reportsRouter } from './routes/reports';
```

reports.ts 側で named export の reportsRouter を出すように修正します。

## 更新ファイル

- server/src/routes/reports.ts
- docs/StarterPack36_ReportsRouter_修復手順.md

## 反映先

C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
