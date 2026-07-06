# Starter Pack 154 残った番号表示を耳標番号へ修正 手順

## 1. 内容

番号表示の全体確認で残っていた、古い表示を修正します。

対象は主に以下です。

```text
個体番号
子牛番号
```

これを耳標番号中心に直します。

---

## 2. 対象ファイル

```text
client/src/pages/BlvList.tsx
client/src/pages/BreedingList.tsx
client/src/pages/HelpPage.tsx
client/src/components/CattlePicker.tsx
```

---

## 3. 追加ファイル

```text
tools/apply_final_number_label_patch.js
tools/restore_final_number_label_patch.js
docs/StarterPack154_残った番号表示を耳標番号へ修正_手順.md
README_StarterPack154_FinalNumberLabelPatch.md
```

---

## 4. 手動追記

不要です。

---

## 5. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 6. 修正コマンド

プロジェクト本体で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\apply_final_number_label_patch.js
```

---

## 7. 確認コマンド

修正後に確認します。

```bash
node tools\check_number_label_final.js
```

以下が出れば理想です。

```text
OK: 主な古い番号表示は見つかりませんでした。
```

---

## 8. 画面確認

clientを起動して確認します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\client
npm run dev
```

主に見る画面:

```text
http://localhost:5173/
http://localhost:5173/blv
http://localhost:5173/breedings
```

---

## 9. 戻したい場合

もし白画面や違和感があれば、戻せます。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\restore_final_number_label_patch.js
```

---

## 10. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Patch remaining number labels to ear tag"
git push
```
