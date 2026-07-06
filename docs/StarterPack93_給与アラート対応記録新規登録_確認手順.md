# Starter Pack 93 給与アラート対応記録 新規登録 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. App.tsx に import を追加する

`client/src/App.tsx` を開きます。

import が並んでいる場所に、次を追加します。

```ts
import { FeedingAlertActionForm } from './pages/FeedingAlertActionForm';
```

## 3. App.tsx に Route を追加する

`<Routes>` の中に、次を追加します。

```tsx
<Route path="/feeding-alert-actions/new" element={<AppLayout><FeedingAlertActionForm /></AppLayout>} />
```

おすすめの追加場所は、前回追加した `/feeding-alert-actions` の近くです。

## 4. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 5. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 6. 一覧画面を開く

Chromeで開きます。

```text
http://localhost:5173/feeding-alert-actions
```

## 7. 新規登録ボタンを確認

一覧画面の右上に以下が表示されればOKです。

```text
新規登録
```

## 8. 新規登録画面を開く

```text
http://localhost:5173/feeding-alert-actions/new
```

## 9. 登録テスト

例として入力します。

```text
子牛名：テスト子牛
日齢：90
アラート種別：不足気味
対応内容：スターターを調整
状態：様子見
メモ：テスト登録
```

「登録する」を押します。

一覧画面に戻り、登録した内容が表示されれば成功です。

## 10. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-alert-actions
```

登録した内容がJSONに増えていればOKです。

## 11. 白い画面になった場合

App.tsx の import または Route の追記ミスの可能性があります。

正しい import:

```ts
import { FeedingAlertActionForm } from './pages/FeedingAlertActionForm';
```

正しい Route:

```tsx
<Route path="/feeding-alert-actions/new" element={<AppLayout><FeedingAlertActionForm /></AppLayout>} />
```

## 12. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 93 feeding alert action create"
git push
```
