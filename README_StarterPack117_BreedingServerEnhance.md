# FarmPro Starter Pack 117 繁殖記録 server API 強化

## 内容

Starter Pack 117では、繁殖記録のserver APIを強化します。

## 更新・追加ファイル

- server/src/routes/breeding.ts
- server/src/data/breeding.json
- docs/StarterPack117_繁殖記録ServerAPI強化_確認手順.md
- docs/StarterPack117_繁殖API項目一覧.md
- README_StarterPack117_BreedingServerEnhance.md

## 手動追記

基本的には不要です。

ただし、もし `/api/breeding` が表示されない場合は、`server/src/app.ts` に繁殖ルートが登録されているか確認してください。

必要な内容の候補:

```ts
import { breedingRouter } from './routes/breeding';
app.use('/api/breeding', breedingRouter);
```

## API

```text
GET /api/breeding
GET /api/breeding/alerts
GET /api/breeding/:id
POST /api/breeding
PUT /api/breeding/:id
DELETE /api/breeding/:id
```

## 対応項目

```text
人工授精
自然交配
受精卵移植
種雄牛
精液番号
ドナー牛
受精卵番号
新鮮卵 / 凍結卵
受精卵ランク
妊娠鑑定予定日
妊娠鑑定結果
状態
分娩予定日
```

## 確認URL

```text
http://localhost:4000/api/breeding
http://localhost:4000/api/breeding/alerts
```

## 次の候補

- Starter Pack 118：種付・受精卵移植 登録画面
- Starter Pack 119：繁殖記録 一覧画面強化
- Starter Pack 120：妊娠鑑定管理
- Starter Pack 121：分娩記録 server API

## GitHub保存

API確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 117 breeding server enhance"
git push
```
