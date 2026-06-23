#!/usr/bin/env bash
# ループ回帰ゲート（黒/青）— Beaver 専用 Stop フック
#
# 役割: 作業完了(Stop)時に「以前 青 だった回帰スイート」を自動実行し、
#       黒(回帰)なら exit 2 で完了をブロックして指揮役に差し戻す。
#       青(全通過)なら exit 0 で完了を許可する。
#
# 設計上の約束（TDD の 赤/緑 とは別物。混同しない）:
#   - これは「ループの 黒/青 ゲート」。回帰の検出が目的。
#   - 認定済みの安定スイートのみを対象にする（下記 SUITE）。
#   - 重さ回避のため「未コミット変更があるときだけ」走る。クリーンなら即 青。
#   - TDD の 赤 で意図的に停止したい場合は、このフックを一時無効化する
#     （/hooks メニュー、または .claude/settings.local.json で上書き）。
set -uo pipefail

# --- 自己ゲート1: Beaver リポジトリでのみ動く ---
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
case "$root" in
  */Beaver) ;;
  *) exit 0 ;;
esac

# --- 自己ゲート2: 未コミットの変更が無ければスキップ（会話だけのStopで走らせない） ---
if git -C "$root" diff --quiet && git -C "$root" diff --cached --quiet; then
  exit 0
fi

fail() { echo "⚫ ループ回帰ゲート: 黒（回帰検出）— 完了をブロックします" >&2; echo "$1" >&2; rm -f "$root"/api/tests/*.sqlite 2>/dev/null; exit 2; }

# --- 回帰スイート（認定済み・青であるべきもの） ---
# フロント: vitest
( cd "$root/frontend" && npx vitest run --silent ) >/tmp/bv_vitest.log 2>&1 \
  || fail "[vitest] $(tail -n 8 /tmp/bv_vitest.log)"

# バックエンド: PHP テスト3本（いずれも失敗時 exit(1)）
php "$root/api/tests/test_sync.php"            >/tmp/bv_sync.log    2>&1 || fail "[test_sync] $(tail -n 8 /tmp/bv_sync.log)"
php "$root/api/tests/test_recalc_inclusive.php">/tmp/bv_recalc.log  2>&1 || fail "[test_recalc_inclusive] $(tail -n 8 /tmp/bv_recalc.log)"
php "$root/api/tests/test_customers.php"       >/tmp/bv_cust.log    2>&1 || fail "[test_customers] $(tail -n 8 /tmp/bv_cust.log)"

rm -f "$root"/api/tests/*.sqlite 2>/dev/null
echo '{"systemMessage":"🔵 ループ回帰ゲート: 青（回帰なし）"}'
exit 0
