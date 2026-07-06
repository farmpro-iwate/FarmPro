# Starter Pack 123 妊娠鑑定 一覧確認画面 確認手順

## 1. 内容

妊娠鑑定の一覧確認画面を追加します。

新しいURL:

```text
/pregnancy-checks
```

既存の繁殖画面は触りません。

```text
/breedings
/breedings/new
/breedings/:id/edit
```

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 追加ファイル

```text
client/src/pages/PregnancyCheckList.tsx
docs/StarterPack123_妊娠鑑定一覧確認画面_確認手順.md
README_StarterPack123_PregnancyCheckList.md
```

---

## 4. App.tsxに手動追記

`client/src/App.tsx` を開きます。

importのところに追加します。

```ts
import { PregnancyCheckList } from './pages/PregnancyCheckList';
```

次に `<Routes>` の中に追加します。

```tsx
<Route path="/pregnancy-checks" element={<AppLayout><PregnancyCheckList /></AppLayout>} />
```

既存の繁殖ルートは触りません。

---

## 5. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 6. clientを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 7. 確認URL

Chromeで開きます。

```text
http://localhost:5173/pregnancy-checks
```

---

## 8. 確認すること

以下が表示されればOKです。

```text
妊娠鑑定 一覧確認
期限切れ
今日鑑定
鑑定待ち
再確認
妊娠
全記録
検索・絞り込み
```

---

## 9. 関連画面確認

以下のボタンが動くか確認します。

```text
繁殖強化 新規登録
繁殖強化 一覧
既存の繁殖一覧
```

---

## 10. 既存画面確認

既存の繁殖画面も確認します。

```text
http://localhost:5173/breedings
```

ここが今まで通り開けば、既存画面を壊していません。

---

## 11. 白画面になった場合

まずApp.tsxに追加した2行を確認します。

```ts
import { PregnancyCheckList } from './pages/PregnancyCheckList';
```

```tsx
<Route path="/pregnancy-checks" element={<AppLayout><PregnancyCheckList /></AppLayout>} />
```

まだ白い場合は、clientの黒い画面の赤いエラーを送ってください。

---

## 12. GitHub保存

動作確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 123 pregnancy check list"
git push
```
