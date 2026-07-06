# Starter Pack 152 牛台帳まわりID表示を耳標番号へ安全置換 手順

## 1. 内容

牛台帳まわりの画面表示で出ている「ID」や「個体番号」などの表示を、耳標番号中心に置き換えます。

今回は、白画面防止のため、画面ファイルを丸ごと上書きしません。

代わりに、表示文字だけを置き換える安全スクリプトを使います。

---

## 2. 追加ファイル

```text
tools/apply_cattle_ear_tag_label_patch.js
tools/restore_cattle_ear_tag_label_patch.js
tools/check_cattle_ear_tag_label_patch.js
docs/StarterPack152_牛台帳まわりID表示を耳標番号へ安全置換_手順.md
README_StarterPack152_CattleEarTagLabelPatch.md
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

## 5. 表示名を置換する

プロジェクト本体で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\apply_cattle_ear_tag_label_patch.js
```

---

## 6. 起動確認

clientを起動します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

Chromeで確認します。

```text
http://localhost:5173/cattle
http://localhost:5173/
```

---

## 7. 置換後チェック

必要なら、以下を実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_cattle_ear_tag_label_patch.js
```

以下が出ればOKです。

```text
OK: 主なID表示は見つかりませんでした。
```

---

## 8. 戻したい場合

もし白画面や違和感があれば、戻せます。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\restore_cattle_ear_tag_label_patch.js
```

復元後、clientを再起動してください。

---

## 9. 置き換える表示

主に以下を置き換えます。

```text
牛ID → 耳標番号
母牛ID → 母牛耳標番号
個体ID → 個体識別番号
個体番号 → 耳標番号
```

---

## 10. 変えないもの

以下の内部名は変えません。

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

---

## 11. GitHub保存

画面確認して問題なければ保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Patch cattle display labels to ear tag"
git push
```
