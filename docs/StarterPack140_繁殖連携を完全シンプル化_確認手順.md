# Starter Pack 140 繁殖連携を完全シンプル化する確認手順

## 1. 内容

繁殖記録連携まわりがややこしくなったため、分娩記録画面から以下を撤去します。

```text
繁殖記録候補の表示
この候補を使う
breedingIdだけ保存
繁殖記録を分娩済みにする
```

今後は、まず以下だけを優先します。

```text
分娩記録
子牛台帳登録
分娩記録一覧確認
```

---

## 2. 更新ファイル

```text
client/src/pages/CalvingEditForm.tsx
client/src/pages/CalvingList.tsx
client/src/services/calvingsApi.ts
tools/check_breeding_link_changes.js
docs/StarterPack140_繁殖連携を完全シンプル化_確認手順.md
README_StarterPack140_RemoveBreedingLinkComplexity.md
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

## 5. 画面確認

server と client を起動します。

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

Chromeで開きます。

```text
http://localhost:5173/calvings
```

---

## 6. 消えていればOK

分娩記録一覧・編集画面から、以下が消えていればOKです。

```text
繁殖記録候補
この候補を使う
breedingIdだけ保存
繁殖記録を分娩済みにする
繁殖未連携
繁殖記録ID
```

---

## 7. 残るもの

以下は残ります。

```text
分娩記録一覧
分娩記録編集
分娩記録削除
子牛台帳へ登録
```

---

## 8. 繁殖記録が書き換わったか確認する

Pack139のボタンを押していた場合、繁殖記録が `分娩済み` になっている可能性があります。

確認コマンド:

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_breeding_link_changes.js
```

以下が表示されなければ、ほぼ書き換わっていません。

```text
breedingLinked: true
status: 分娩済み
calvingRecordId
```

---

## 9. 書き換わっていた場合

表示された内容を見てから戻します。

自動で戻すと、もともと正しかったデータまで壊す可能性があるため、今回は自動戻しは入れていません。

表示結果をChatGPTに貼れば、戻し方を1つずつ案内できます。

---

## 10. GitHub保存

画面確認して、問題なければ保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Simplify calving screens remove breeding link complexity"
git push
```
