# Starter Pack 55 飼料給与新規登録 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { FeedingForm } from './pages/FeedingForm';
```

### 追加2：Route の近く

```tsx
<Route path="/feedings/new" element={<AppLayout><FeedingForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/feedings" element={<AppLayout><FeedingList /></AppLayout>} />
<Route path="/feedings/new" element={<AppLayout><FeedingForm /></AppLayout>} />
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

## 5. 飼養管理画面を開く

```text
http://localhost:5173/feedings
```

## 6. 新規登録を確認

飼料給与管理画面の右上に「新規登録」ボタンが出ればOKです。

押すと次へ移動します。

```text
http://localhost:5173/feedings/new
```

## 7. テスト登録

例:

```text
給与日: 今日の日付
対象: 母牛群
飼料名: 配合飼料
給与量: 120
単位: kg
単価: 80
金額: 9600
給与目的: 維持
メモ: テスト登録
```

登録後、飼料給与一覧に戻り、一覧に1件表示されれば成功です。

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/feedings
```

登録したデータが表示されればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 55 feeding create"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
