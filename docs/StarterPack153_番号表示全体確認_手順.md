# Starter Pack 153 番号表示全体確認 手順

## 1. 内容

FarmPro全体で、画面上の番号表示がどこまで整理できているか確認します。

今回は画面変更はしません。

---

## 2. 追加ファイル

```text
tools/check_number_label_final.js
docs/StarterPack153_番号表示全体確認_手順.md
docs/StarterPack153_番号表示の今後の進め方.md
README_StarterPack153_NumberLabelFinalCheck.md
```

---

## 3. 手動追記

不要です。

---

## 4. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 5. 確認コマンド

プロジェクト本体で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_number_label_final.js
```

---

## 6. 確認する言葉

古い表示として確認するもの:

```text
子牛ID
母牛ID
牛ID
個体ID
個体番号
子牛名または子牛ID
子牛名または耳標番号
子牛名・耳標番号
```

新しい表示として確認するもの:

```text
耳標番号
母牛耳標番号
子牛耳標番号
個体識別番号
```

---

## 7. 見る場所

結果が長い場合、全部見る必要はありません。

見るのはここだけでOKです。

```text
1. 残っている可能性がある表示
3. 判定
```

---

## 8. OKの目安

以下が出ればかなり良い状態です。

```text
OK: 主な古い番号表示は見つかりませんでした。
```

または、

```text
残りは少なめです。
```

なら、あとで少しずつ直せば大丈夫です。

---

## 9. 注意

以下のようなプログラム内部名は、画面に出ていなければ残してOKです。

```text
id
cowId
calfId
cattleId
```

内部名まで全部変えると、アプリが壊れる可能性があります。

---

## 10. GitHub保存

確認ツールとdocsだけなので、反映後に保存してOKです。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add final number label check"
git push
```
