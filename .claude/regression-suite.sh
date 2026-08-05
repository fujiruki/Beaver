#!/usr/bin/env bash
# Beaver 回帰スイート本体（ハードゲート）。exit 0=🔵青 / 非0=⚫黒。
# git/未コミット判定は持たない（呼び出し側＝親ディスパッチャ or Beaver自己ゲートが担う）。
# 自分の位置からプロジェクトルートを解決するので、どの CWD から呼ばれてもよい。
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .../Beaver

fail() { echo "$1" >&2; rm -f "$root"/api/tests/*.sqlite 2>/dev/null; exit 1; }

# フロント: vitest
( cd "$root/frontend" && npx vitest run --silent ) >/tmp/bv_vitest.log 2>&1 \
  || fail "[vitest] $(tail -n 8 /tmp/bv_vitest.log)"

# バックエンド: PHP テスト8本（いずれも失敗時 exit 1）
php "$root/api/tests/test_sync.php"              >/tmp/bv_sync.log   2>&1 || fail "[test_sync] $(tail -n 8 /tmp/bv_sync.log)"
php "$root/api/tests/test_recalc_inclusive.php"  >/tmp/bv_recalc.log 2>&1 || fail "[test_recalc_inclusive] $(tail -n 8 /tmp/bv_recalc.log)"
php "$root/api/tests/test_customers.php"         >/tmp/bv_cust.log  2>&1 || fail "[test_customers] $(tail -n 8 /tmp/bv_cust.log)"
php "$root/api/tests/test_voucher_lines_edit.php" >/tmp/bv_lines.log 2>&1 || fail "[test_voucher_lines_edit] $(tail -n 8 /tmp/bv_lines.log)"
php "$root/api/tests/test_projects.php"          >/tmp/bv_projects.log 2>&1 || fail "[test_projects] $(tail -n 8 /tmp/bv_projects.log)"
php "$root/api/tests/test_list_sort.php"         >/tmp/bv_list_sort.log 2>&1 || fail "[test_list_sort] $(tail -n 8 /tmp/bv_list_sort.log)"
php "$root/api/tests/test_tategu_cost_lines.php" >/tmp/bv_tategu_cost_lines.log 2>&1 || fail "[test_tategu_cost_lines] $(tail -n 8 /tmp/bv_tategu_cost_lines.log)"
php "$root/api/tests/test_feedback.php"          >/tmp/bv_feedback.log 2>&1 || fail "[test_feedback] $(tail -n 8 /tmp/bv_feedback.log)"
php "$root/api/tests/test_project_statuses.php"  >/tmp/bv_project_statuses.log 2>&1 || fail "[test_project_statuses] $(tail -n 8 /tmp/bv_project_statuses.log)"

rm -f "$root"/api/tests/*.sqlite 2>/dev/null
exit 0
