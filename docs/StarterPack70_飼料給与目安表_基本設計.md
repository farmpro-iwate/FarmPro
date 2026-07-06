# Starter Pack 70 飼料給与目安表 基本設計

## 目的

FarmProに、子牛・育成牛向けの「飼料給与目安表」を追加する。

画像で確認したような、日齢・月齢ごとの給与量、体重、体高、胸囲の目安をアプリ内で確認できるようにする。

最終的には、子牛の生年月日から日齢を自動計算し、その日齢に近い給与目安を表示する。

---

## 追加したい画面

### 画面名

```text
飼料給与目安表
```

### 画面URL案

```text
/feeding-guide
```

### メニュー表示名案

```text
給与目安
```

---

## 管理する項目

飼料給与目安表では、以下の項目を管理する。

```text
日齢
月齢
ステージ名
体重目安
体高目安
胸囲目安
スターター給与量
育成配合給与量
粗飼料給与量
その他給与量
メモ
```

---

## データ項目案

```ts
type FeedingGuideRecord = {
  id: string;
  ageDays: string;
  ageMonth: string;
  stageName: string;
  targetWeight: string;
  targetHeight: string;
  targetChest: string;
  starterAmount: string;
  growingFeedAmount: string;
  roughageAmount: string;
  otherAmount: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};
```

---

## 初期データ案

画像の内容をもとに、まずは以下のような日齢区分を準備する。

正確な数値は、画像や農場の実際の給与設計に合わせて後で調整する。

```text
0日
30日
60日
90日
120日
150日
180日
210日
240日
275日
```

---

## 画面表示イメージ

```text
飼料給与目安表

日齢    月齢    体重目安    スターター    育成配合    粗飼料    メモ
0       0       40kg        -             -           -         生時
30      1       60kg        1.0kg         -           少量      哺乳期
60      2       85kg        2.0kg         -           0.5kg     離乳準備
90      3       110kg       3.0kg         1.0kg       1.0kg     離乳後
120     4       140kg       -             2.0kg       2.0kg     育成前期
```

---

## 子牛管理との連動

子牛の生年月日から日齢を計算する。

例:

```text
子牛名：はなこ
生年月日：2026-04-01
今日：2026-07-01
日齢：91日
```

その日齢に一番近い給与目安を表示する。

例:

```text
日齢91日のため、90日目安を表示
```

---

## 子牛カルテへの表示案

子牛カルテに以下を追加する。

```text
現在の日齢
該当する給与目安
体重目安
スターター給与量
育成配合給与量
粗飼料給与量
```

表示例:

```text
現在日齢：91日

給与目安：
スターター：3.0kg
育成配合：1.0kg
粗飼料：1.0kg
体重目安：110kg
```

---

## 飼料給与実績との比較

すでにFarmProには「飼料給与管理」がある。

その実績データと、給与目安表を比較できるようにする。

### 比較例

```text
目安給与量：3.0kg
実際給与量：2.5kg
差：-0.5kg
```

---

## アラート案

将来的には、不足や過多をアラート表示する。

### 不足例

```text
目安より少ない給与量です。
目安：3.0kg
実績：2.0kg
差：-1.0kg
```

### 過多例

```text
目安より多い給与量です。
目安：3.0kg
実績：4.0kg
差：+1.0kg
```

---

## 注意点

飼料給与目安は農場ごと、品種ごと、季節ごと、飼料設計ごとに変わる。

そのため、最初は固定表ではなく、FarmPro内で編集できる形にするのが望ましい。

---

## 実装順序

安全に進めるため、以下の順番で追加する。

```text
Starter Pack 71：飼料給与目安 server API
Starter Pack 72：飼料給与目安 一覧画面
Starter Pack 73：飼料給与目安 新規登録
Starter Pack 74：飼料給与目安 編集・削除
Starter Pack 75：子牛の日齢から給与目安を表示
Starter Pack 76：給与目安と実績の比較
Starter Pack 77：不足・過多アラート
```

---

## Starter Pack 71で追加する予定のAPI

```text
GET    /api/feeding-guide
GET    /api/feeding-guide/:id
POST   /api/feeding-guide
PUT    /api/feeding-guide/:id
DELETE /api/feeding-guide/:id
```

---

## 保存ファイル案

server側では以下にJSON保存する。

```text
server/src/data/feedingGuide.json
```

---

## まとめ

この機能を追加すると、FarmProは単なる記録アプリではなく、以下を支援できるようになる。

```text
日齢に合った給与目安の確認
目安と実績の比較
不足・過多の発見
子牛育成の標準化
飼料管理の見える化
```

飼料在庫、飼料給与実績、給与目安表がつながることで、FarmProの実用性がかなり高くなる。
