# R-0093: PHPテスト用一時SQLiteファイルの競合対策

## 背景
2026-08-05、複数のCodex実装・指揮役の検証コマンドを並行実行した際に、`api/tests/`配下の各テストファイルがランダムに失敗する事象を確認した。原因は、各テストファイルが固定名の一時SQLite（例: `api/tests/test_projects.sqlite`）を使っており、同時に2つ以上のプロセスが同じテストファイルを実行すると、片方が作成・書き込み中のDBをもう片方が`unlink()`・再作成してしまい、競合が起きるため。単独実行時は問題なし。

藤田晴樹さんより2026-08-11、会話内で明示的に着手指示。

## 対象
`api/tests/`配下の以下11ファイル（すべて同一パターンで固定名`__DIR__ . '/test_<名前>.sqlite'`を使用）:
`test_history.php` / `test_invoices.php` / `test_projects.php` / `test_list_sort.php` / `test_customers.php` / `test_project_statuses.php` / `test_feedback.php` / `test_tategu_cost_lines.php` / `test_recalc_inclusive.php` / `test_sync.php` / `test_voucher_lines_edit.php`

（`test_feedback.php`は既に専用の一時ディレクトリパターンを使っている可能性があるため、実装時に個別確認し、既に対応済みなら変更不要）

## 修正方針
各テストファイルの一時DBパス生成を、プロセスごとに一意になるよう変更する:

```php
$testDbPath = __DIR__ . '/test_projects_' . getmypid() . '.sqlite';
```

（`getmypid()`はPHPの現在プロセスIDを返す組み込み関数。同時実行された2つの`php api/tests/test_projects.php`プロセスが異なるファイルを使うようになり、競合が解消される）

あわせて、テスト終了後に一時ファイルを確実に削除する処理を追加する（現状は起動時に`unlink()`するのみで、正常終了後の後片付けが無く、`api/tests/`ディレクトリに`test_*.sqlite`が残り続ける）:

```php
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});
```

`register_shutdown_function`はPHPスクリプトが正常終了・異常終了（fatal error含む）のいずれでも呼ばれるため、テスト失敗時にも確実にクリーンアップされる。

## 確認してほしいこと
- 既存の`.gitignore`に`api/tests/test_*.sqlite`（またはより広いパターン）が含まれているか確認する。含まれていなければ追加する（一意なファイル名になるため、都度違うファイル名がuntrackedとして出現しうる）
- `bash .claude/regression-suite.sh`（またはPHPテストをまとめて実行しているスクリプト）が、各テストファイルの実行完了を待ってから次に進む構成になっているか確認する（本件の修正はあくまで「同時実行時の競合」対策であり、逐次実行の枠組み自体は変更しない）

## TDD不要（インフラ・テスト実行基盤自体の修正のため）
本修正はテストコードそのものの信頼性向上が目的であり、新たに検証すべきアプリケーションロジックは無い。代わりに以下の方法で修正の効果を確認すること:
1. 修正前後で、同一テストファイル（例: `test_projects.php`）を2プロセス同時に起動し（例: `php api/tests/test_projects.php & php api/tests/test_projects.php & wait`）、両方とも正常終了することを確認する
2. 修正後、`api/tests/`ディレクトリに`test_*.sqlite`ファイルが残っていないこと（`register_shutdown_function`によるクリーンアップの確認）
3. 全11ファイルを対象に、単独実行では従来通り全テストがパスすることを確認する（既存の検証手順を踏襲）

## 受け入れ条件
1. 対象11ファイルすべてで、一時DBパスがプロセスIDを含む一意な名前になっている
2. 同一テストファイルを2プロセス同時実行しても、どちらも正常に完了し、テスト結果が正しい（競合エラーが発生しない）
3. テスト正常終了後、一時SQLiteファイルが`api/tests/`ディレクトリに残らない
4. 既存の単独実行時のテスト結果（合格件数）が変わらない
5. `bash .claude/regression-suite.sh`が引き続きexit 0になる
