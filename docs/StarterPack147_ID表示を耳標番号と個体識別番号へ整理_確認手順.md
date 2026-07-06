# Starter Pack 147 ID表示を耳標番号と個体識別番号へ整理 確認手順

## 1. 内容

分娩記録画面の「母牛ID」「子牛ID」などの表示を、実運用向けに整理します。

画面では、主に耳標番号で識別します。

---

## 2. 方針

```text
母牛ID → 母牛耳標番号
子牛ID → 表示しない
子牛名・耳標番号 → 子牛耳標番号
```

正式な番号として必要な場合は、

```text
個体識別番号
```

としてメモや台帳側で管理します。

---

## 3. 更新ファイル

```text
client/src/pages/CalvingForm.tsx
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
docs/StarterPack147_ID表示を耳標番号と個体識別番号へ整理_確認手順.md
docs/StarterPack147_耳標番号と個体識別番号の運用ルール.md
README_StarterPack147_EarTagIdentificationLabels.md
```

---

## 4. 手動追記

不要です。

---

## 5. 確認URL

登録画面:

```text
http://localhost:5173/calvings/new
```

一覧画面:

```text
http://localhost:5173/calvings
```

---

## 6. 登録画面で確認すること

以下の表示になっていればOKです。

```text
母牛耳標番号
子牛耳標番号
```

以下の表示は出ない方針です。

```text
母牛ID
子牛ID
子牛名・耳標番号
```

---

## 7. 一覧画面で確認すること

一覧表に以下が表示されればOKです。

```text
母牛耳標番号
子牛耳標番号
```

「子牛ID」という列は表示しません。

---

## 8. 子牛台帳登録前の確認

「子牛台帳へ登録」を押した時に、以下が表示されればOKです。

```text
母牛
母牛耳標番号
子牛耳標番号
性別
出生日
出生体重
```

---

## 9. 注意

内部データ上は、古い名前の `cowId` や `calfName` を使っています。

ただし画面表示は耳標番号として扱います。

これは、今までのデータを壊さないためです。

---

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Rename calving labels to ear tag identifiers"
git push
```
