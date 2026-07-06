# Starter Pack 133 ホーム分娩記録 軽量表示 確認手順

## 1. 内容

ホーム画面に分娩記録の確認枠を追加します。

ただし、アラートを増やしすぎない方針なので、表示は最低限にします。

```text
子牛台帳へ未登録の分娩記録
初乳未確認・要確認
最近の分娩記録
```

---

## 2. 更新ファイル

```text
client/src/pages/Home.tsx
docs/StarterPack133_ホーム分娩記録軽量表示_確認手順.md
README_StarterPack133_HomeCalvingSummary.md
```

---

## 3. 手動追記

今回は不要です。

---

## 4. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

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

## 7. ホームを開く

```text
http://localhost:5173
```

---

## 8. 確認すること

ホームに以下が表示されればOKです。

```text
分娩記録 確認
分娩記録を見る
分娩記録 新規登録
子牛台帳未登録
初乳確認待ち
最近の分娩記録
```

---

## 9. ボタン確認

### 分娩記録を見る

```text
http://localhost:5173/calvings
```

へ移動できればOKです。

### 分娩記録 新規登録

```text
http://localhost:5173/calvings/new
```

へ移動できればOKです。

---

## 10. 注意

今回のホーム表示は、細かいアラートではありません。

目的は、

```text
分娩後の子牛台帳登録漏れ
初乳確認漏れ
```

だけを軽く気づけるようにすることです。

---

## 11. エラーになった場合

ホームが白くなった場合は、`client/src/pages/Home.tsx` を戻してください。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore client/src/pages/Home.tsx
```

---

## 12. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 133 home calving summary"
git push
```
