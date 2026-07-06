# Starter Pack 118 白画面修正版 確認手順

## 1. 原因

白画面の原因は、client側のTypeScriptエラーの可能性が高いです。

特に、既存の繁殖一覧画面が `breedingApi.ts` の古い関数名を呼んでいて、
新しいAPIファイルと名前が合わなくなった可能性があります。

---

## 2. 修正内容

この修正版では、`client/src/services/breedingApi.ts` に互換用の関数名を追加しました。

---

## 3. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 4. clientを再起動

clientの黒い画面で止めます。

```text
Ctrl + C
```

その後:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

---

## 5. serverを起動

serverも起動しておきます。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 6. 確認URL

まずホームを確認します。

```text
http://localhost:5173
```

次に繁殖一覧を確認します。

```text
http://localhost:5173/breedings
```

次に新規登録画面を確認します。

```text
http://localhost:5173/breedings/new
```

---

## 7. まだ白い場合

clientの黒い画面に赤いエラーが出ています。

その赤いエラーの最初の3行を送ってください。
