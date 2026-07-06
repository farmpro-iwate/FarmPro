# Starter Pack 129 修正版2 分娩結果選択肢修正

## 1. 内容

分娩結果の選択肢を、より現場向けに修正します。

修正前:

```text
自然分娩
介助分娩
死産
中止
```

修正後:

```text
自然分娩
難産
外科的処置
死産
```

---

## 2. 方針

「中止」は分娩結果として使わない方針にします。

「要確認」は結果ではなく、メモで管理します。

---

## 3. 運用例

```text
分娩結果: 自然分娩
メモ: 初乳確認済み。
```

```text
分娩結果: 難産
メモ: 軽く牽引。子牛やや弱いので明日確認。
```

```text
分娩結果: 外科的処置
メモ: 獣医対応。母牛経過観察。
```

```text
分娩結果: 死産
メモ: 母牛経過観察。
```

---

## 4. 更新ファイル

```text
client/src/pages/CalvingForm.tsx
server/src/routes/calvings.ts
server/src/data/calvings.json
docs/StarterPack129_分娩結果選択肢修正2_確認手順.md
README_StarterPack129_CalvingResultRepair2.md
```

---

## 5. 手動追記

今回は不要です。

---

## 6. 確認URL

```text
http://localhost:5173/calvings/new
```

分娩結果の選択肢が以下になっていればOKです。

```text
自然分娩
難産
外科的処置
死産
```

---

## 7. API確認

```text
http://localhost:4000/api/calvings
```

---

## 8. summary確認

```text
http://localhost:4000/api/calvings/summary
```

以下の項目が出ればOKです。

```text
natural
dystocia
surgical
stillbirth
```

---

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Repair calving result options again"
git push
```
