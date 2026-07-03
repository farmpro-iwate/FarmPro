# Starter Pack 28 出荷販売一覧画面 追加手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 追加ファイルを確認する

次の2つがあるか確認します。

```text
client/src/services/salesApi.ts
client/src/pages/SalesList.tsx
```

## 3. client/src/App.tsx を開く

次のファイルを開きます。

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client\src\App.tsx
```

## 4. importを追加する

上の import が並んでいる場所に、次を追加します。

```ts
import { SalesList } from './pages/SalesList';
```

## 5. Routeを追加する

他の Route が並んでいる場所に、次を追加します。

```tsx
<Route path="/sales" element={<AppLayout><SalesList /></AppLayout>} />
```

おすすめの追加場所は、`/reports` や `/schedules` の近くです。

## 6. client/src/components/AppLayout.tsx を開く

次のファイルを開きます。

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client\src\components\AppLayout.tsx
```

## 7. メニューに追加する

`navItems` の中に、次を追加します。

```ts
{ label: '出荷販売', path: '/sales' },
```

おすすめの追加場所は、`レポート` や `予定` の近くです。

## 8. 保存する

それぞれ保存します。

```text
Ctrl + S
```

## 注意

今回は既存ファイルを自動上書きしていません。
手動追加にした理由は、白い画面トラブルを避けるためです。
