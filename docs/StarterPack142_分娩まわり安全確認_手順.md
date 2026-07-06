# Starter Pack 142 分娩まわり安全確認 手順

## 1. 内容

分娩記録まわりが、シンプルな状態に戻っているか確認します。

確認する内容:

```text
繁殖候補APIが撤去されているか
繁殖記録を書き換えるAPIが撤去されているか
子牛台帳登録APIは残っているか
分娩記録に繁殖連携の跡が残っていないか
繁殖記録が分娩済みに書き換わっていないか
```

---

## 2. 追加ファイル

```text
tools/check_calving_simple_mode.js
docs/StarterPack142_分娩まわり安全確認_手順.md
README_StarterPack142_CalvingSafetyCheck.md
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

## 5. 安全確認コマンド

プロジェクト本体で実行します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_calving_simple_mode.js
```

---

## 6. OKの表示

以下のように表示されれば安全です。

```text
子牛台帳登録API register-calf: OK あります
繁殖候補API breeding-candidates: OK 撤去されています
繁殖書き換えAPI complete-breeding: OK 撤去されています
OK: 分娩記録に繁殖連携の跡は見つかりませんでした。
OK: breeding.json に分娩済み書き換えの跡は見つかりませんでした。
OK: breedings.json に分娩済み書き換えの跡は見つかりませんでした。
```

---

## 7. 注意が出た場合

以下のような表示が出た場合は、まだ何か残っています。

```text
NG 残っています
注意: 分娩記録に繁殖連携の跡があります
注意: breedings.json に分娩済み書き換えの可能性がある記録があります
```

その場合は、表示された内容をそのままChatGPTに貼ってください。

自動で戻すより、表示内容を見ながら一つずつ戻す方が安全です。

---

## 8. 画面確認

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

以下だけが残っていればOKです。

```text
分娩記録一覧
分娩記録編集
分娩記録削除
子牛台帳へ登録
```

---

## 9. GitHub保存

安全確認がOKなら保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add calving simple mode safety check"
git push
```
