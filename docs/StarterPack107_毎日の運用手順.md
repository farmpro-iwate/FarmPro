# Starter Pack 107 毎日の運用手順

## 1. 朝または作業後に見る画面

最初にホームを見ます。

```text
http://localhost:5173
```

確認する場所:

```text
給与アラート
注意子牛リスト
対応記録 期限アラート
```

---

## 2. 毎日やること

## 2-1. 給与実績を入力

飼養管理画面で、その日の給与実績を入力します。

```text
飼養管理
```

入力するもの:

```text
給与日
子牛名
スターター
育成配合
粗飼料
メモ
```

---

## 2-2. ホームで注意子牛を確認

ホームで以下を確認します。

```text
不足気味
多め
実績なし
```

気になる子牛がいたら、対応記録を追加します。

---

## 2-3. 対応記録を残す

対応したら、給与アラート対応記録に残します。

例:

```text
スターターを0.5kg増やした
粗飼料を少し減らした
実績入力漏れだったので登録した
3日後に再確認
```

---

## 2-4. 次回確認日を入れる

様子を見る場合は、次回確認日を入れます。

例:

```text
2026-07-08
```

状態は以下のどれかにします。

```text
様子見
再確認必要
対応中
```

---

## 3. 週に1回やること

## 3-1. レポート確認

```text
http://localhost:5173/reports
```

確認するもの:

```text
給与アラート集計
対応記録集計
対応記録期限アラート集計
収支
```

---

## 3-2. バックアップ確認

保存場所:

```text
server/src/data
```

この中にデータがあります。

週に1回、GitHub保存またはバックアップを行います。

---

## 4. 月に1回やること

## 4-1. 月別収支確認

```text
月別収支
```

確認するもの:

```text
売上
経費
収支
```

## 4-2. 経費の入力漏れ確認

よく漏れやすいもの:

```text
飼料費
診療費
薬品費
燃料費
修理費
資材費
```

---

## 5. 作業後のGitHub保存

作業が終わったら保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Save FarmPro daily data"
git push
```

毎日必ずでなくてもよいですが、入力が多い日は保存がおすすめです。

---

## 6. 作業を終えるとき

serverの黒い画面で押します。

```text
Ctrl + C
```

clientの黒い画面でも押します。

```text
Ctrl + C
```

その後、黒い画面を閉じます。

---

## 7. 次回始めるとき

server:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

client:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

Chrome:

```text
http://localhost:5173
```

---

## 8. 困った時

## 8-1. 画面が古い

```text
Ctrl + F5
```

## 8-2. 動かない

serverとclientが起動しているか確認します。

## 8-3. 4000番が使われている

```bash
taskkill /F /IM node.exe
```

その後、serverとclientを起動し直します。

## 8-4. 白い画面

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
