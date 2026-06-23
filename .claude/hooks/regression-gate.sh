#!/usr/bin/env bash
# Beaver 単体起動セッション用 Stop フック（黒/青ゲート）。
# 親ルート起動時は Projects/.claude のディスパッチャが担うが、Beaver起点起動でも効くよう自己ゲートする。
#
# TDD の 赤/緑 とは別物（ループの 黒/青）。混同しない。詳細は Beaver/CLAUDE.md「ループエンジニアリング協議」。
# TDD の 🔴赤 で意図的に停止したい場合は /hooks か .claude/settings.local.json でこのフックを一時無効化する。
set -uo pipefail

# --- 自己ゲート1: Beaver リポジトリでのみ動く ---
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
case "$root" in
  */Beaver) ;;
  *) exit 0 ;;
esac

# --- 自己ゲート2: 未コミットの変更が無ければスキップ ---
if git -C "$root" diff --quiet && git -C "$root" diff --cached --quiet; then
  exit 0
fi

# --- 回帰スイート本体に委譲 ---
if out="$(bash "$root/.claude/regression-suite.sh" 2>&1)"; then
  echo '{"systemMessage":"🔵 ループ回帰ゲート(Beaver): 青（回帰なし）"}'
  exit 0
else
  echo "⚫ ループ回帰ゲート(Beaver): 黒（回帰検出）— 完了をブロックします" >&2
  echo "$out" >&2
  rm -f "$root"/api/tests/*.sqlite 2>/dev/null
  exit 2
fi
