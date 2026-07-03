# Starter Pack 29 出荷販売新規登録 追加手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 追加ファイルを確認する

次のファイルがあるか確認します。

```text
client/src/pages/SalesForm.tsx
client/src/services/salesApi.ts
```

## 3. client/src/App.tsx を開く

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client\src\App.tsx
```

## 4. importを追加する

上の import が並んでいる場所に、次を追加します。

```ts
import { SalesForm } from './pages/SalesForm';
```

## 5. Routeを追加する

他の Route が並んでいる場所に、次を追加します。

```tsx
<Route path="/sales/new" element={<AppLayout><SalesForm /></AppLayout>} />
```

おすすめの場所は、Starter Pack 28で追加した `/sales` の近くです。

例:

```tsx
<Route path="/sales" element={<AppLayout><SalesList /></AppLayout>} />
<Route path="/sales/new" element={<AppLayout><SalesForm /></AppLayout>} />
```

## 6. 保存する

```text
Ctrl + S
```

## 7. 直接URLで開く

まずはボタン追加なしで、直接URLから確認します。

```text
http://localhost:5173/sales/new
```

## 注意

今回は白い画面を避けるため、SalesList.tsxに「新規登録」ボタンはまだ自動追加していません。
確認できたら、次のStarter Packで一覧画面にボタンを追加します。
