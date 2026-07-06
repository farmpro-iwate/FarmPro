# Starter Pack 117 繁殖記録 server API 強化 確認手順

## 1. 内容

繁殖記録のserver APIを強化します。

今回対応する項目:

```text
人工授精
自然交配
受精卵移植
種雄牛
精液番号
ドナー牛
受精卵番号
新鮮卵 / 凍結卵
受精卵ランク
妊娠鑑定予定日
妊娠鑑定結果
状態
分娩予定日
```

---

## 2. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 3. 手動追記

今回は基本的に不要です。

既に `server/src/app.ts` に以下のような繁殖ルート登録がある前提です。

```ts
app.use('/api/breeding', breedingRouter);
```

もし `/api/breeding` が表示されない場合は、app.ts側の確認が必要です。

---

## 4. serverを起動する

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 5. API確認

Chromeで開きます。

```text
http://localhost:4000/api/breeding
```

サンプルの繁殖記録JSONが表示されればOKです。

---

## 6. アラートAPI確認

Chromeで開きます。

```text
http://localhost:4000/api/breeding/alerts
```

以下のようなJSONが表示されればOKです。

```json
{
  "total": 0,
  "alerts": []
}
```

日付によってはアラートが出る場合もあります。

---

## 7. 画面について

今回はserver APIの強化のみです。

アプリ画面はまだ変わりません。

次のPackで、種付・受精卵移植の登録画面を整えます。

---

## 8. 追加・更新ファイル

```text
server/src/routes/breeding.ts
server/src/data/breeding.json
docs/StarterPack117_繁殖記録ServerAPI強化_確認手順.md
docs/StarterPack117_繁殖API項目一覧.md
README_StarterPack117_BreedingServerEnhance.md
```

---

## 9. GitHub保存

API確認後に保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 117 breeding server enhance"
git push
```

---

## 10. エラーになった場合

もし以下のようなエラーが出た場合:

```text
Cannot GET /api/breeding
```

app.tsに繁殖ルートが登録されていない可能性があります。

その場合は、次を確認します。

```text
server/src/app.ts
```

必要なimport候補:

```ts
import { breedingRouter } from './routes/breeding';
```

必要なapp.use候補:

```ts
app.use('/api/breeding', breedingRouter);
```

ただし、既にある場合は二重に入れないでください。
