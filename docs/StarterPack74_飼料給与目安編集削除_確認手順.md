# Starter Pack 74 飼料給与目安編集・削除 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedingGuideEditForm } from './pages/FeedingGuideEditForm';
```

### 追加2：Route の近く

```tsx
<Route path="/feeding-guide/:id/edit" element={<AppLayout><FeedingGuideEditForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/feeding-guide" element={<AppLayout><FeedingGuideList /></AppLayout>} />
<Route path="/feeding-guide/new" element={<AppLayout><FeedingGuideForm /></AppLayout>} />
<Route path="/feeding-guide/:id/edit" element={<AppLayout><FeedingGuideEditForm /></AppLayout>} />
```

## 3. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 5. 飼料給与目安画面を開く

```text
http://localhost:5173/feeding-guide
```

## 6. 編集テスト

一覧に「編集」ボタンが出ます。

押すと編集画面へ移動します。

例:

```text
http://localhost:5173/feeding-guide/feeding_guide_90/edit
```

日齢、体重目安、メモなどを変更して「更新」を押します。

一覧に戻り、変更内容が反映されていれば成功です。

## 7. 削除テスト

一覧の「削除」ボタンを押します。

確認メッセージが出ます。

```text
この飼料給与目安を削除しますか？
```

OKを押して一覧から消えれば成功です。

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

編集・削除が反映されていればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 74 feeding guide edit delete"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
