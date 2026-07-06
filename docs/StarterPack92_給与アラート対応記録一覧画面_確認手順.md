# Starter Pack 92 給与アラート対応記録 一覧画面 確認手順

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
import { FeedingAlertActionList } from './pages/FeedingAlertActionList';
```

## 3. App.tsx に Route を追加する

`<Routes>` の中に、次を追加します。

```tsx
<Route path="/feeding-alert-actions" element={<AppLayout><FeedingAlertActionList /></AppLayout>} />
```

おすすめの追加場所は、`/feeding-guide` の近くです。

## 4. AppLayout.tsx にメニューを追加する

`client/src/components/AppLayout.tsx` を開きます。

メニューが並んでいる場所に、次を追加します。

```ts
{ label: '対応記録', path: '/feeding-alert-actions' },
```

おすすめの追加場所は、`給与目安` の近くです。

## 5. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 6. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 7. 画面確認

Chromeで開きます。

```text
http://localhost:5173/feeding-alert-actions
```

## 8. 表示されればOK

以下が表示されれば成功です。

```text
給与アラート対応記録
対応日
子牛
日齢
アラート
対応内容
状態
次回確認日
メモ
```

サンプル記録として、以下のような内容が表示されればOKです。

```text
サンプル子牛
不足気味
スターターを調整
様子見
```

## 9. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-alert-actions
```

JSONが表示されれば server 側はOKです。

## 10. 白い画面になった場合

App.tsx の import または Route の追記ミスの可能性があります。

正しい import:

```ts
import { FeedingAlertActionList } from './pages/FeedingAlertActionList';
```

正しい Route:

```tsx
<Route path="/feeding-alert-actions" element={<AppLayout><FeedingAlertActionList /></AppLayout>} />
```

## 11. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 92 feeding alert action list"
git push
```
