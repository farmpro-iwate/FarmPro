# Starter Pack 100 全体確認チェックリスト

## 1. 目的

Starter Pack 100では、ここまで作成してきた FarmPro の機能を一度整理し、動作確認しやすくします。

今回はコード変更ではなく、確認用ドキュメントの追加です。

---

## 2. ここまでの大きな完成範囲

FarmProには、以下の機能が入りました。

```text
ホーム
牛台帳
子牛管理
繁殖管理
ワクチン管理
BLV管理
予定管理
治療管理
レポート
バックアップ・復元
検索・絞り込み
印刷・帳票
農場設定
出荷・販売管理
経費管理
月別収支
飼養管理
飼料在庫管理
飼料給与目安表
給与目安と実績比較
全子牛給与アラート
給与アラートCSV
給与アラート印刷
ホーム給与アラート表示
ホーム注意子牛リスト
給与アラート対応記録
給与アラート対応記録CSV
給与アラート対応記録印刷
レポート対応記録集計
```

---

## 3. 起動確認

### 3-1. server

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

成功表示:

```text
FarmPro server running at http://localhost:4000
```

### 3-2. client

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

Chromeで以下を開きます。

### 4-1. レポート集計

```text
http://localhost:4000/api/reports/summary
```

確認する文字:

```text
feedingAlerts
feedingAlertActions
```

### 4-2. 飼料給与目安

```text
http://localhost:4000/api/feeding-guide
```

### 4-3. 給与アラート対応記録

```text
http://localhost:4000/api/feeding-alert-actions
```

---

## 5. 画面確認

### 5-1. ホーム

```text
http://localhost:5173
```

確認する内容:

```text
給与アラート
注意子牛リスト
対応記録ボタン
```

### 5-2. 給与目安

```text
http://localhost:5173/feeding-guide
```

確認する内容:

```text
給与目安
全子牛給与アラート
CSV出力
印刷
```

### 5-3. 給与アラート対応記録

```text
http://localhost:5173/feeding-alert-actions
```

確認する内容:

```text
新規登録
CSV出力
印刷
検索・絞り込み
編集
削除
```

### 5-4. レポート

```text
http://localhost:5173/reports
```

確認する内容:

```text
給与アラート集計
給与アラート対応記録集計
全対応記録
未対応
対応中
対応済み
様子見
再確認必要
今月の対応
```

---

## 6. よくある確認ポイント

## 6-1. 画面が古い場合

Chromeで押します。

```text
Ctrl + F5
```

## 6-2. serverが開けない場合

serverが止まっている可能性があります。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 6-3. clientが開けない場合

clientが止まっている可能性があります。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 6-4. 4000番が使用中の場合

Nodeを止めます。

```bash
taskkill /F /IM node.exe
```

その後、serverとclientを起動し直します。

---

## 7. 白い画面になった場合

慌てずに戻します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```

その後、必要ならもう一度ZIPを反映します。

---

## 8. GitHub保存前チェック

保存前に以下を確認します。

```text
server が起動する
client が起動する
ホームが表示される
レポートが表示される
/api/reports/summary が表示される
```

---

## 9. GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 100 final check docs"
git push
```

---

## 10. 今後追加できる候補

Starter Pack 100以降で追加できる候補です。

```text
給与アラート対応記録を子牛カルテに表示
対応記録の期限アラート
再確認必要をホームに表示
対応記録の月別集計
農場設定でアラート判定基準を変更
飼料給与目安データを実際の表に合わせて調整
牛ごとの収支
母牛ごとの繁殖成績
スマホ表示の改善
バックアップ自動化
```

---

## 11. いったん完成として見てよい範囲

現在のFarmProは、以下の流れまでできる状態です。

```text
子牛を登録
給与目安を登録
飼料給与実績を登録
目安と実績を比較
不足・多め・実績なしを確認
ホームで注意子牛を確認
対応記録を残す
対応記録を検索
CSV出力
印刷
レポートで集計
```

このため、飼料給与管理まわりは一通り運用テストできる段階です。
