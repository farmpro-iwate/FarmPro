# Starter Pack 94 給与アラート対応記録 編集・削除 確認手順

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
import { FeedingAlertActionEditForm } from './pages/FeedingAlertActionEditForm';
```

## 3. App.tsx に Route を追加する

`<Routes>` の中に、次を追加します。

```tsx
<Route path="/feeding-alert-actions/:id/edit" element={<AppLayout><FeedingAlertActionEditForm /></AppLayout>} />
```

おすすめの追加場所は、前回追加した `/feeding-alert-actions/new` の近くです。

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

## 7. 編集ボタンを確認

一覧の右側に以下が表示されればOKです。

```text
編集
削除
```

## 8. 編集確認

「編集」を押します。

編集画面でメモや状態を変更して「保存する」を押します。

一覧画面に戻り、変更内容が反映されれば成功です。

## 9. 削除確認

不要なテスト記録で「削除」を押します。

確認メッセージでOKすると、一覧から消えれば成功です。

## 10. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-alert-actions
```

編集・削除結果がJSONに反映されていればOKです。

## 11. 白い画面になった場合

App.tsx の import または Route の追記ミスの可能性があります。

正しい import:

```ts
import { FeedingAlertActionEditForm } from './pages/FeedingAlertActionEditForm';
```

正しい Route:

```tsx
<Route path="/feeding-alert-actions/:id/edit" element={<AppLayout><FeedingAlertActionEditForm /></AppLayout>} />
```

## 12. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 94 feeding alert action edit delete"
git push
```
