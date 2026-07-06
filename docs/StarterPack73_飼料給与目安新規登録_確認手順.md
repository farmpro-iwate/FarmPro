# Starter Pack 73 飼料給与目安新規登録 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedingGuideForm } from './pages/FeedingGuideForm';
```

### 追加2：Route の近く

```tsx
<Route path="/feeding-guide/new" element={<AppLayout><FeedingGuideForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/feeding-guide" element={<AppLayout><FeedingGuideList /></AppLayout>} />
<Route path="/feeding-guide/new" element={<AppLayout><FeedingGuideForm /></AppLayout>} />
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

## 6. 新規登録を確認

画面右上に「新規登録」ボタンが出ればOKです。

押すと次へ移動します。

```text
http://localhost:5173/feeding-guide/new
```

## 7. テスト登録

例:

```text
日齢: 300
月齢: 10
ステージ名: 育成後期
体重目安: 320
体高目安: 120
胸囲目安: 155
スターター給与量:
育成配合給与量: 3.0
粗飼料給与量: 5.0
その他給与量:
メモ: テスト登録
```

登録後、飼料給与目安一覧に戻り、一覧に1件追加されれば成功です。

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feeding-guide
```

登録したデータが表示されればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 73 feeding guide create"
git push
```
