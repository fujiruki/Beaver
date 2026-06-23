# ループ回帰ゲート（黒/青）アーキテクチャ

ループエンジニアリングの「完了(Stop)時の回帰ゲート」を、複数プロジェクト横断セッション（親 `C:\Fujiruki\Projects` 起点）でも効くように構成したもの。

## 用語（混同しない）
- **TDD: 🔴赤 / 🟢緑** … 赤=仕様先行の失敗テスト（進捗・正規手順）、緑=実装で通る。
- **ループ: ⚫黒 / 🔵青** … 黒=回帰ゲートでブロック（回帰 or 未完）、青=回帰なし・完了OK。

## 構成

```
C:\Fujiruki\Projects\.claude\
  ├── settings.json                 # Stop フック登録（★非gitリポジトリ＝ローカルのみ。本docが控え）
  └── hooks\regression-gate.sh      # 親ディスパッチャ（★同上）
Beaver\.claude\
  ├── settings.json                 # Beaver単体起動用 Stop フック（git管理）
  ├── hooks\regression-gate.sh      # Beaver自己ゲート→suite呼び出し
  └── regression-suite.sh           # ★スイート本体: vitest + PHP3本（git管理）
AccessTategu\.claude\
  └── regression-notify.txt         # 通知のみ（自動実行しない・git管理）
```

## 親ディスパッチャの挙動
1. Projects 直下で `.git` を持つサブディレクトリだけを対象（親 `C:\Fujiruki` repo の walk-up に頼らない）。
2. **未コミット変更（tracked diff or staged）が無いリポジトリはスキップ**（会話だけのStopは無音）。
3. 変更ありのリポジトリを規約で分岐:
   - `<proj>/.claude/regression-suite.sh` → ハードゲート（実行・失敗で⚫黒）
   - `<proj>/.claude/regression-notify.txt` → 通知のみ（実行せず nudge）
4. 黒が1つでもあれば stderr に出して **exit 2（完了ブロック）**。黒なし・通知ありは systemMessage を出して exit 0。

## オプトイン規約（新プロジェクト追加時）
- ハードゲートに載せる: `<proj>/.claude/regression-suite.sh`（exit 0=青/非0=黒、自己完結）を置く。
- 通知のみ: `<proj>/.claude/regression-notify.txt`（表示文）を置く。

## AccessTategu を通知のみにした理由
`scripts/build_and_test.ps1` は冒頭で `taskkill /F /IM MSACCESS.EXE`（**本番Accessを開いていると強制終了・データ喪失**）し、Access COM/GUI を複数回起動して 2〜5分。軽量な非COMテストが無い。→ 毎Stop自動実行は危険かつ重いため、人間ゲート（手動 build_and_test）に残す。

## 検証（パイプテスト・実証済み 2026-06-24）
`echo '{}' | bash .claude/hooks/regression-gate.sh` に対し:
1. 全クリーン → 無音・exit 0
2. Beaver緑 → exit 0
3. Beaver黒（テスト破壊）→ ⚫[Beaver]＋失敗詳細を stderr、exit 2
4. AccessTategu変更 → 🔔通知を systemMessage、exit 0
5. 黒+通知同時 → 黒優先 exit 2

## 復元用: 親 `.claude` の内容（非gitのため消失時はここから再作成）

`C:\Fujiruki\Projects\.claude\settings.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "bash .claude/hooks/regression-gate.sh", "timeout": 180, "statusMessage": "ループ回帰ゲート(親ディスパッチャ)実行中..." } ] }
    ]
  }
}
```

`C:\Fujiruki\Projects\.claude\hooks\regression-gate.sh` の要点:
- `root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`（hooks→.claude→Projects の2階層上げ。**1階層だと .claude 止まりになるバグに注意**）。
- `for d in "$root"/*/` を走査し `[ -e "$proj/.git" ]` でリポジトリ判定、`git -C "$proj" diff --quiet && --cached --quiet` で未変更スキップ。
- suite=ハードゲート(exit2集約) / notify.txt=systemMessage。JSON は `node -e` で安全生成（jq未インストール）。

## 注意
- 親 `.claude` はバージョン管理外。将来 Projects を git 化するか、本docを正本として扱う。
- TDDの🔴赤で意図的に停止する時は `/hooks` か `settings.local.json` でゲートを一時無効化。詳細は `CLAUDE.md`「ループエンジニアリング協議」。
