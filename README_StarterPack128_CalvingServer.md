# FarmPro Starter Pack 128 分娩記録 server API

## 内容

Starter Pack 128では、分娩記録を保存するserver APIを追加します。

## 追加ファイル

```text
server/src/data/calvings.json
server/src/routes/calvings.ts
docs/StarterPack128_分娩記録ServerAPI_確認手順.md
README_StarterPack128_CalvingServer.md
```

## app.ts 手動追記

### import欄

```ts
import { calvingsRouter } from './routes/calvings';
```

### app.use欄

```ts
app.use('/api/calvings', calvingsRouter);
```

## 確認URL

```text
http://localhost:4000/api/calvings
```

集計確認:

```text
http://localhost:4000/api/calvings/summary
```

## API

```text
GET    /api/calvings
GET    /api/calvings/summary
GET    /api/calvings/:id
POST   /api/calvings
PUT    /api/calvings/:id
DELETE /api/calvings/:id
```

## 方針

分娩記録は、まず別APIとして安全に追加します。

既存の以下は触りません。

```text
子牛管理
繁殖管理
牛台帳
```

## 次の候補

```text
Starter Pack 129：分娩記録 登録画面
Starter Pack 130：分娩記録 一覧画面
Starter Pack 131：分娩記録から子牛台帳へ連携
```

## GitHub保存

確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 128 calving server API"
git push
```
