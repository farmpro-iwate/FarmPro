# Starter Pack 95 給与アラート対応記録 検索・絞り込み 確認手順

## 1. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

## 2. 手動追記

今回は不要です。

## 3. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

## 4. clientを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

## 5. 一覧画面を開く

Chromeで開きます。

```text
http://localhost:5173/feeding-alert-actions
```

## 6. 確認すること

一覧画面に以下が表示されればOKです。

```text
検索・絞り込み
キーワード検索
アラート種別
状態
対応日 From
対応日 To
次回確認日 From
次回確認日 To
絞り込み解除
```

## 7. 絞り込み確認

以下を試してください。

```text
アラート種別：不足気味
状態：様子見
キーワード：サンプル
```

条件に合う記録だけ表示されれば成功です。

## 8. 解除確認

「絞り込み解除」を押します。

すべての条件が空になり、一覧が戻れば成功です。

## 9. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 95 feeding alert action filter"
git push
```

## 10. 白い画面になった場合

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git restore .
git clean -fd
```
