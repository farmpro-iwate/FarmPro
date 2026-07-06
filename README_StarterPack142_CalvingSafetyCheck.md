# FarmPro Starter Pack 142 分娩まわり安全確認

## 内容

分娩記録まわりが、シンプルな状態に戻っているか確認するためのパックです。

## 追加ファイル

```text
tools/check_calving_simple_mode.js
docs/StarterPack142_分娩まわり安全確認_手順.md
README_StarterPack142_CalvingSafetyCheck.md
```

## 手動追記

不要です。

## 確認コマンド

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
node tools\check_calving_simple_mode.js
```

## 確認すること

```text
breeding-candidates APIが撤去されている
complete-breeding APIが撤去されている
register-calf APIは残っている
分娩記録に繁殖連携の跡がない
繁殖記録が分娩済みに書き換わっていない
```

## 今後の方針

当面は以下だけを優先します。

```text
分娩記録を登録
子牛台帳へ登録
分娩記録一覧で確認
```

## GitHub保存

```bash
cd C:\Users\関口\Downloads\FarmPro_StarterPack1\FarmPro_StarterPack1
git status
git add .
git commit -m "Add calving simple mode safety check"
git push
```
