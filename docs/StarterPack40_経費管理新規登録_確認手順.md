# Starter Pack 40 経費管理新規登録 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. client/src/App.tsx に手動追記する

### 追加1：import の近く

```ts
import { ExpenseForm } from './pages/ExpenseForm';
```

### 追加2：Route の近く

```tsx
<Route path="/expenses/new" element={<AppLayout><ExpenseForm /></AppLayout>} />
```

おすすめの並び:

```tsx
<Route path="/expenses" element={<AppLayout><ExpenseList /></AppLayout>} />
<Route path="/expenses/new" element={<AppLayout><ExpenseForm /></AppLayout>} />
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

## 5. 経費管理画面を開く

```text
http://localhost:5173/expenses
```

## 6. 新規登録を確認

経費管理画面の右上に「新規登録」ボタンが出ればOKです。

押すと次へ移動します。

```text
http://localhost:5173/expenses/new
```

## 7. テスト登録

例:

```text
支払日: 今日の日付
経費区分: 飼料費
内容: 配合飼料 テスト
支払先: JA
金額: 120000
支払方法: 口座振替
対象: 母牛全体
メモ: テスト登録
```

登録後、経費一覧に戻り、一覧に1件表示されれば成功です。

## 8. API確認

Chromeで開きます。

```text
http://localhost:4000/api/expenses
```

登録したデータが表示されればOKです。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 40 expense create"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
