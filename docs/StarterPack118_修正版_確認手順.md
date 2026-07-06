# Starter Pack 118 修正版 確認手順

## 1. 修正内容

前回のPack118では、確認URLを `/breeding/new` と案内していました。

しかし現在のApp.tsxでは、繁殖管理のURLは複数形です。

正しいURL:

```text
http://localhost:5173/breedings/new
```

また、App.tsx側で以下のように `mode` を渡しているため、

```tsx
<BreedingForm mode="create" />
<BreedingForm mode="edit" />
```

BreedingForm側でも `mode` を受け取れるように修正しました。

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 手動追記

今回は不要です。

今のApp.tsxにすでに以下があります。

```tsx
<Route path="/breedings" element={<AppLayout><BreedingList /></AppLayout>} />
<Route path="/breedings/new" element={<AppLayout><BreedingForm mode="create" /></AppLayout>} />
<Route path="/breedings/:id/edit" element={<AppLayout><BreedingForm mode="edit" /></AppLayout>} />
```

このままでOKです。

---

## 4. clientを再起動

clientの黒い画面で一度止めます。

```text
Ctrl + C
```

その後:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 5. serverも起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 6. 確認URL

Chromeで開きます。

```text
http://localhost:5173/breedings/new
```

---

## 7. 確認すること

以下ができればOKです。

```text
人工授精を選べる
自然交配を選べる
受精卵移植を選べる
実施日を変えると分娩予定日が変わる
実施日を変えると妊娠鑑定予定日が変わる
登録ボタンが表示される
```

---

## 8. API確認

登録後、Chromeで確認します。

```text
http://localhost:4000/api/breeding
```

もし表示されなければこちらも確認します。

```text
http://localhost:4000/api/breedings
```

---

## 9. 画面が古い場合

Chromeで押します。

```text
Ctrl + F5
```

---

## 10. GitHub保存

画面確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Repair Starter Pack 118 breeding form route"
git push
```
