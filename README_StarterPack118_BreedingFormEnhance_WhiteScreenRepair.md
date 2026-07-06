# FarmPro Starter Pack 118 白画面修正版

## 内容

Starter Pack 118適用後に白画面になる問題を修正するための互換性パックです。

## 更新ファイル

```text
client/src/services/breedingApi.ts
docs/StarterPack118_白画面修正版_確認手順.md
README_StarterPack118_BreedingFormEnhance_WhiteScreenRepair.md
```

## 手動追記

不要です。

## 修正内容

既存の繁殖一覧・編集画面が古い関数名を使っていても動くように、
`breedingApi.ts` に互換用の関数名を追加しました。

## 確認URL

```text
http://localhost:5173
http://localhost:5173/breedings
http://localhost:5173/breedings/new
```
