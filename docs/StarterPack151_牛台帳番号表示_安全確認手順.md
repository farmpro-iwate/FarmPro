# Starter Pack 151 牛台帳番号表示 安全確認手順

## 1. 内容

牛台帳の表示を耳標番号・個体識別番号中心に直す前に、どのファイルを直すべきか確認します。

今回は画面変更はしません。

---

## 2. 追加ファイル

```text
tools/check_cattle_number_labels.js
docs/StarterPack151_牛台帳番号表示_安全確認手順.md
docs/StarterPack151_牛台帳表示修正方針.md
README_StarterPack151_CattleNumberLabelSafetyCheck.md
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
node tools\check_cattle_number_labels.js
```

---

## 6. 何を確認するか

以下の言葉がどのファイルに残っているか確認します。

```text
牛ID
母牛ID
個体ID
ID
cattleId
cowId
earTag
個体番号
個体識別番号
耳標番号
```

---

## 7. 結果の見方

出力に以下のようなファイルが出る可能性があります。

```text
client/src/pages/CattleList.tsx
client/src/pages/CattleForm.tsx
client/src/pages/CattleDetail.tsx
client/src/services/cattleApi.ts
server/src/data/cattle.json
```

この中で、画面表示に関係するものから安全に直します。

---

## 8. 次に直す表示

基本の置き換え方針です。

```text
牛ID → 耳標番号
母牛ID → 母牛耳標番号
個体ID → 個体識別番号
個体番号 → 耳標番号 または 個体識別番号
```

---

## 9. 内部データ名はすぐ変えない

以下の内部名は、すぐには変更しません。

```text
id
cowId
cattleId
earTag
```

理由:

```text
内部名まで変えるとアプリが壊れやすい
既存データとのつながりが切れる可能性がある
```

まずは画面表示だけ直します。

---

## 10. なぜ今回は確認だけか

牛台帳はアプリの中心です。

```text
繁殖管理
治療管理
ワクチン管理
BLV管理
予定管理
出荷・販売
子牛台帳
分娩記録
```

多くの画面とつながっています。

いきなり上書きすると白画面になる可能性があるため、まず確認します。

---

## 11. 結果を貼る

コマンド実行結果をChatGPTに貼れば、次のPackで安全に修正できます。

---

## 12. GitHub保存

docsと確認ツールのみなので、反映後に保存してOKです。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add cattle number label safety check"
git push
```
