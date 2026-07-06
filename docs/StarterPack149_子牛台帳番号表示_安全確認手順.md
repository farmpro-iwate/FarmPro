# Starter Pack 149 子牛台帳番号表示 安全確認手順

## 1. 内容

子牛台帳の表示を耳標番号中心に直す前に、どのファイルを直すべきか確認します。

今回は画面変更はしません。

---

## 2. 追加ファイル

```text
tools/check_calf_number_labels.js
docs/StarterPack149_子牛台帳番号表示_安全確認手順.md
docs/StarterPack149_子牛台帳表示修正方針.md
README_StarterPack149_CalfNumberLabelSafetyCheck.md
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
node tools\check_calf_number_labels.js
```

---

## 6. 何を確認するか

以下の言葉がどのファイルに残っているか確認します。

```text
子牛ID
母牛ID
牛ID
ID
calfId
cowId
calfName
earTag
個体識別番号
耳標番号
```

---

## 7. 結果の見方

出力に以下のようなファイルが出る可能性があります。

```text
client/src/pages/CalfList.tsx
client/src/pages/CalfDetail.tsx
client/src/pages/CalfForm.tsx
client/src/services/calvesApi.ts
```

この中で、画面表示に関係するものから安全に直します。

---

## 8. 次に直す表示

基本の置き換え方針です。

```text
子牛ID → 子牛耳標番号
母牛ID → 母牛耳標番号
牛ID → 耳標番号
子牛名・耳標番号 → 子牛耳標番号
```

内部データ名はすぐ変えません。

```text
calfId
cowId
calfName
```

これらは内部名として残して、画面表示だけ変えます。

---

## 9. なぜ今回は確認だけか

子牛台帳は、他の画面から多く使われています。

```text
子牛一覧
子牛カルテ
分娩記録からの登録
飼料給与目安
給与アラート
```

いきなり上書きすると白画面になる可能性があります。

そのため、まずどのファイルが使われているか確認します。

---

## 10. 結果を貼る

コマンド実行結果をChatGPTに貼れば、次のPackで安全に修正できます。

---

## 11. GitHub保存

docsと確認ツールのみなので、反映後に保存してOKです。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add calf number label safety check"
git push
```
