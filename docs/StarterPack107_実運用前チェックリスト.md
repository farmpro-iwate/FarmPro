# Starter Pack 107 実運用前チェックリスト

## 1. 目的

このチェックリストは、FarmProを実際の農場管理で使い始める前に確認するためのものです。

ここまでで機能はかなり揃っています。

これからは、機能を増やすよりも、

```text
入力ルールを決める
毎日の使い方を決める
バックアップ方法を決める
間違えた時の戻し方を確認する
```

ことが大事です。

---

## 2. まず確認する画面

Chromeで以下を確認します。

```text
http://localhost:5173
```

主に確認する画面:

```text
ホーム
牛台帳
子牛管理
飼養管理
給与目安
給与アラート対応記録
子牛カルテ
レポート
バックアップ・復元
```

---

## 3. 起動確認

## 3-1. server

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

成功表示:

```text
FarmPro server running at http://localhost:4000
```

## 3-2. client

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

成功表示:

```text
Local: http://localhost:5173/
```

---

## 4. API確認

Chromeで開きます。

```text
http://localhost:4000/api/reports/summary
```

文字がたくさん表示されればOKです。

特に以下があるか確認します。

```text
feedingAlerts
feedingAlertActions
feedingAlertActionDueAlerts
```

---

## 5. 実運用前に決めること

## 5-1. 子牛名の付け方

子牛名は後から検索や履歴確認で使います。

おすすめ:

```text
耳標番号
または
耳標番号 + 呼び名
```

例:

```text
1234
1234 はなこ
```

注意:

```text
同じ名前を何頭にも使わない
表記ゆれを作らない
```

悪い例:

```text
子牛A
子牛Ａ
A子牛
あか
赤
```

---

## 5-2. 日付の入力ルール

日付は必ず同じ形式で入力します。

```text
2026-07-05
```

避ける入力:

```text
7/5
7月5日
令和8年7月5日
```

---

## 5-3. 飼料名の入力ルール

飼料名も表記ゆれが起きやすいです。

おすすめ:

```text
スターター
育成配合
粗飼料
ミルク
代用乳
```

一度決めた名前を使い続けます。

---

## 5-4. 状態の使い方

給与アラート対応記録の状態は、以下の意味で使います。

```text
未対応：まだ確認していない
対応中：対応を始めたが完了していない
対応済み：確認・対応が終わった
様子見：しばらく観察する
再確認必要：もう一度確認が必要
```

おすすめ:

```text
対応が完了したら必ず「対応済み」にする
様子見の場合は次回確認日を入れる
再確認必要の場合も次回確認日を入れる
```

---

## 6. 最初に入れるべきデータ

運用開始前に、最低限以下を入れます。

```text
成牛
子牛
給与目安
飼料給与実績
```

余裕があれば以下も入れます。

```text
繁殖記録
ワクチン記録
BLV記録
治療記録
飼料在庫
出荷・販売
経費
```

---

## 7. 最初のテスト手順

本格運用の前に、テスト用に1頭で流れを確認します。

```text
1. 子牛を1頭登録
2. 給与目安を登録
3. 飼料給与実績を登録
4. ホームで給与アラートを見る
5. 対応記録を登録
6. 子牛カルテで履歴を見る
7. レポートで集計を見る
8. CSV出力を試す
9. 印刷を試す
```

この流れができれば、実運用に入れます。

---

## 8. バックアップ確認

大事なデータはJSONファイルに保存されています。

主な保存場所:

```text
server/src/data
```

ここに以下のようなファイルがあります。

```text
cattle.json
calves.json
feedings.json
feedingGuide.json
feedingAlertActions.json
sales.json
expenses.json
```

運用前に、このフォルダがあるか確認します。

---

## 9. GitHub保存確認

変更後はGitHubへ保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Save FarmPro operation ready state"
git push
```

---

## 10. トラブル時の戻し方

白い画面になったり、動かなくなった場合は、慌てずに戻します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

その後、serverとclientを起動し直します。

---

## 11. 実運用開始OKの目安

以下が全部OKなら、実運用を始めてよい段階です。

```text
serverが起動する
clientが起動する
ホームが表示される
子牛登録ができる
給与実績が登録できる
給与目安が表示される
対応記録が登録できる
子牛カルテに履歴が出る
レポートが表示される
バックアップ場所が分かる
GitHub保存ができる
```

---

## 12. これからの方針

次にやるなら、機能追加よりも以下がおすすめです。

```text
実際の給与目安表に合わせてデータ調整
スマホ表示の改善
入力ミス防止
バックアップしやすくする
印刷帳票の見た目調整
```
