# Starter Pack 91 給与アラート対応記録 server API 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. app.ts に手動追記する

今回は server API を追加するので、`server/src/app.ts` に追記します。

## 3. import を追加

`server/src/app.ts` の import が並んでいる場所に、次を追加します。

```ts
import { feedingAlertActionsRouter } from './routes/feedingAlertActions';
```

## 4. app.use を追加

ほかの `app.use('/api/...')` が並んでいる場所に、次を追加します。

```ts
app.use('/api/feeding-alert-actions', feedingAlertActionsRouter);
```

## 5. serverを起動し直す

server側の黒い画面で一度止めます。

```text
Ctrl + C
```

その後、もう一度起動します。

```bash
npm run dev
```

## 6. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-alert-actions
```

サンプルのJSONが表示されれば成功です。

## 7. 期待される表示例

```json
[
  {
    "id": "faa_sample_001",
    "actionDate": "2026-07-05",
    "calfName": "サンプル子牛",
    "alertType": "不足気味",
    "actionType": "スターターを調整",
    "status": "様子見"
  }
]
```

## 8. うまくいかない場合

### Cannot find module が出る場合

追記した import の文字が間違っている可能性があります。

正しくはこれです。

```ts
import { feedingAlertActionsRouter } from './routes/feedingAlertActions';
```

### 404になる場合

`app.use` の追記が足りない可能性があります。

正しくはこれです。

```ts
app.use('/api/feeding-alert-actions', feedingAlertActionsRouter);
```

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 91 feeding alert action server"
git push
```
