# Starter Pack 136 分娩記録から繁殖記録候補検索API 確認手順

## 1. 内容

分娩記録から、関連しそうな繁殖記録候補を探すAPIを追加します。

追加API:

```text
GET /api/calvings/:id/breeding-candidates
```

今回は、繁殖記録を自動更新しません。

---

## 2. 更新ファイル

```text
server/src/routes/calvings.ts
client/src/services/calvingsApi.ts
docs/StarterPack136_分娩記録から繁殖記録候補検索API_確認手順.md
README_StarterPack136_CalvingBreedingCandidates.md
```

---

## 3. 手動追記

今回は不要です。

---

## 4. ZIPを反映する

ZIPを解凍して、中身をプロジェクト本体へ上書きコピーします。

反映先:

```text
C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
```

---

## 5. serverを起動

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1\server
npm run dev
```

---

## 6. 分娩記録IDを確認

Chromeで開きます。

```text
http://localhost:4000/api/calvings
```

分娩記録の `id` を確認します。

例:

```text
calving_sample_001
```

---

## 7. 候補検索APIを確認

例:

```text
http://localhost:4000/api/calvings/calving_sample_001/breeding-candidates
```

以下のように表示されればOKです。

```json
{
  "calving": {},
  "count": 1,
  "candidates": []
}
```

候補がない場合は `count: 0` でも正常です。

---

## 8. 候補の判断条件

候補は以下を元に探します。

```text
分娩記録のbreedingIdと一致
母牛IDが一致
母牛名が一致
分娩予定日が近い
実分娩日と繁殖側予定日が近い
繁殖側状態が妊娠・確認待ちなど
```

---

## 9. 点数

候補には `candidateScore` が付きます。

点数が高いほど、関連している可能性が高いです。

理由は `candidateReasons` に表示されます。

---

## 10. 今回まだやらないこと

```text
繁殖記録を分娩済みにする
画面上で候補を選ぶ
分娩記録に自動でbreedingIdを入れる
```

これらは次以降で進めます。

---

## 11. エラーになった場合

### Cannot GET /api/calvings/.../breeding-candidates

`server/src/routes/calvings.ts` が反映されていない可能性があります。

### countが0

候補がないだけなら正常です。

母牛名・母牛ID・分娩予定日が繁殖記録と合っているか確認します。

---

## 12. GitHub保存

確認できてから保存します。

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add Starter Pack 136 calving breeding candidates API"
git push
```
