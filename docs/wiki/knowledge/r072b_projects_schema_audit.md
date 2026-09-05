# R-072-B projectsテーブル dev/prod スキーマ乖離棚卸し

作成日: 2026-07-15

## 調査範囲

- 初期スキーマ: `api/schema.sql`
- migration: `api/migrations/*.sql` 全21ファイル（`002`から`021`まで）
- 適用記録: `api/migrations/applied.txt`
- APIコード参照: `api/**/*.php` のうち、`projects` を含むSQL文
- 除外: 本番DB照会、ローカル/本番DBへの `PRAGMA table_info` 実行、migration実行、コード変更

## migration履歴から再構築したprojectsテーブル

初期DBは `api/schema.sql` で作成される前提で、`api/schema.sql:77-87` の `CREATE TABLE IF NOT EXISTS projects` を起点にし、`api/migrations` 配下の番号順SQLを重ねた。

| カラム | 型・制約 | 根拠 |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `api/schema.sql:78` |
| `customer_id` | `INTEGER NOT NULL REFERENCES customers(id)` | `api/schema.sql:79` |
| `name` | `TEXT NOT NULL` | `api/schema.sql:80` |
| `description` | `TEXT` | `api/schema.sql:81` |
| `status` | `TEXT NOT NULL DEFAULT 'active'` | `api/schema.sql:82` |
| `start_date` | `DATE` | `api/schema.sql:83` |
| `end_date` | `DATE` | `api/schema.sql:84` |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `api/schema.sql:85` |
| `updated_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `api/schema.sql:86` |
| `project_code` | `TEXT` | `api/migrations/002_projects_columns.sql:1` |
| `address` | `TEXT` | `api/migrations/002_projects_columns.sql:2` |
| `memo` | `TEXT` | `api/migrations/002_projects_columns.sql:3` |
| `delivery_date` | `DATE` | `api/migrations/002_projects_columns.sql:4` |
| `order_date` | `DATE` | `api/migrations/020_projects_owner_contractor_contact.sql:1` |
| `owner_name` | `TEXT` | `api/migrations/020_projects_owner_contractor_contact.sql:2` |
| `general_contractor_name` | `TEXT` | `api/migrations/020_projects_owner_contractor_contact.sql:3` |
| `site_contact` | `TEXT` | `api/migrations/020_projects_owner_contractor_contact.sql:4` |

関連インデックス:

- `idx_projects_customer` on `projects(customer_id)`: `api/schema.sql:88`
- `idx_projects_status` on `projects(status)`: `api/schema.sql:89`
- `idx_projects_code` unique on `projects(project_code)`: `api/migrations/002_projects_columns.sql:5`

projectsテーブル自体への列追加ではないが、projectsを参照する関連migration:

- `project_images.project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE`: `api/migrations/003_project_images.sql:3`
- `vouchers_new.project_id INTEGER REFERENCES projects(id)`: `api/migrations/012_vouchers_customer_id_nullable.sql:32`

## applied.txt 照合

`api/migrations/applied.txt` の記録では、devは `002_projects_columns` から `021_tategu_cost_lines` まで記録されている。

prodは `006` から `021` まで記録されているが、`002_projects_columns`、`003_project_images`、`004_tategu_catalog_name`、`005_sales_categories` のprod適用行は見当たらない。projects列に直接関係するのは `002_projects_columns` で、`project_code`、`address`、`memo`、`delivery_date`、`idx_projects_code` が対象。

既知の020番については、`applied.txt` に以下の趣旨で記録されている。

- `020_projects_owner_contractor_contact`: prodは「適用不要: 本番に4列とも既存。手動追加されていた模様」

このため、020番の4列（`order_date`、`owner_name`、`general_contractor_name`、`site_contact`）は既知の乖離として扱う。

## コードが参照しているprojectsカラム

API本体で明示参照されるprojectsカラムは以下。

| カラム | 主な根拠 |
|---|---|
| `id` | `api/routes/projects.php:94`, `api/routes/projects.php:106`, `api/routes/projects.php:113`, `api/routes/sync_helpers.php:93`, `api/routes/sync_helpers.php:103`, `api/routes/vouchers.php:491`, `api/routes/tategu_items.php:141` |
| `project_code` | `api/routes/projects.php:94`, `api/routes/projects.php:262`, `api/routes/projects.php:300` |
| `customer_id` | `api/routes/projects.php:98`, `api/routes/projects.php:239`, `api/routes/projects.php:300`, `api/routes/projects.php:329`, `api/routes/sync_helpers.php:140`, `api/routes/sync_helpers.php:944` |
| `name` | `api/routes/projects.php:94`, `api/routes/projects.php:247`, `api/routes/projects.php:263`, `api/routes/projects.php:300`, `api/routes/vouchers.php:488`, `api/routes/tategu_items.php:138` |
| `description` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `status` | `api/routes/projects.php:96`, `api/routes/projects.php:110`, `api/routes/projects.php:236`, `api/routes/projects.php:243`, `api/routes/projects.php:265`, `api/routes/projects.php:300`, `api/routes/projects.php:345` |
| `start_date` | `api/routes/projects.php:266`, `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `end_date` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `updated_at` | `api/routes/projects.php:96`, `api/routes/projects.php:102`, `api/routes/projects.php:268`, `api/routes/projects.php:288`, `api/routes/projects.php:335`, `api/routes/projects.php:345`, `api/routes/sync_helpers.php:140`, `api/routes/sync_helpers.php:944` |
| `delivery_date` | `api/routes/projects.php:96`, `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `address` | `api/routes/projects.php:96`, `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `memo` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `order_date` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `owner_name` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `general_contractor_name` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |
| `site_contact` | `api/routes/projects.php:300`, `api/routes/projects.php:329` |

`SELECT p.*` / `SELECT * FROM projects` により、projectsの全列をレスポンスへ含める箇所もある。

- `api/routes/projects.php:201`
- `api/routes/projects.php:273`
- `api/routes/projects.php:285`
- `api/routes/projects.php:321`
- `api/routes/projects.php:338`
- `api/tests/test_projects.php:110`
- `api/tests/test_projects.php:130`

`api/tests` で明示参照されるprojectsカラムは、本体コードと同じ集合内に収まる。

- `api/tests/test_projects.php:90`, `api/tests/test_projects.php:119`
- `api/tests/test_list_sort.php:71`, `api/tests/test_list_sort.php:80`
- `api/tests/test_sync.php:59`, `api/tests/test_sync.php:445`, `api/tests/test_sync.php:448`, `api/tests/test_sync.php:571`, `api/tests/test_sync.php:949`, `api/tests/test_sync.php:964`, `api/tests/test_sync.php:971`, `api/tests/test_sync.php:988`

なお、`customer_name`、`customer_access_no`、`project_name` はSQLの別名またはcustomers由来の値であり、projectsテーブルの物理カラムではない。

## 突合結果

コードが明示参照しているprojectsカラムは、すべて `api/schema.sql`、`002_projects_columns.sql`、`020_projects_owner_contractor_contact.sql` のいずれかで定義されている。

| 判定 | カラム |
|---|---|
| schema.sqlで定義済み | `id`, `customer_id`, `name`, `description`, `status`, `start_date`, `end_date`, `created_at`, `updated_at` |
| migration 002で定義済み | `project_code`, `address`, `memo`, `delivery_date` |
| migration 020で定義済み（既知のprod手動追加扱い） | `order_date`, `owner_name`, `general_contractor_name`, `site_contact` |

## 記録漏れの疑い

### migrationファイルとして未記録の疑い

020番を除くと、コードが参照しているのに `schema.sql` または `api/migrations/*.sql` に定義が見当たらないprojectsカラムは検出されなかった。

### applied.txt上のprod適用記録の要確認

`applied.txt` 上、prodには `002_projects_columns` の適用記録が見当たらない。一方、コードは `project_code`、`address`、`memo`、`delivery_date` を参照しており、これらは `002_projects_columns.sql` で追加される列である。

これは「migrationファイルが存在しない記録漏れ」ではなく、「prod適用記録の欠落または初期構築時点で既に反映済み」の可能性がある。実態確認には本番DBの `projects` テーブル定義確認が必要だが、本調査では本番DB照会は禁止のため実行していない。

## 020番以外に新規で見つかった差分

- コード参照カラム vs migration/schema定義の突合では、020番以外の新規差分は見つからなかった。
- ただし、`applied.txt` のprod記録だけを見ると `002_projects_columns` のprod適用記録がない。これは本番DB実態照会が必要な要確認事項として残る。

## 本番照会が別途必要な項目

本番DBへはアクセスしていない。別途承認後に確認するなら、以下が必要。

- `projects` の実カラム一覧に `project_code`, `address`, `memo`, `delivery_date` が存在するか
- `projects` の実カラム一覧に020番の `order_date`, `owner_name`, `general_contractor_name`, `site_contact` が存在するか（既知事項の再確認）
- `idx_projects_code` または同等の `project_code` UNIQUEインデックスが存在するか
- `applied.txt` にprod `002_projects_columns` の記録がない理由が、初期構築時の反映済みなのか、記録漏れなのか

本調査では上記の `PRAGMA table_info(projects)`、`PRAGMA index_list(projects)`、本番SSH/FTPS経由のDB取得・照会は一切実行していない。

## 実行した確認コマンド

- `Get-Content -Raw -Encoding UTF8 -LiteralPath AGENTS.md`
- `Get-Content -Encoding UTF8 -LiteralPath api/migrations/applied.txt`
- `Get-ChildItem -LiteralPath api/migrations -Filter *.sql | Sort-Object Name`
- `Get-Content -Encoding UTF8 -LiteralPath api/schema.sql`
- `Get-Content -Encoding UTF8 -LiteralPath api/migrations/*.sql`
- `rg -l --glob '*.php' --glob '!backups/**' --glob '!*.log' "\\bprojects\\b" api`
- `rg -n --glob '*.php' --glob '!backups/**' --glob '!*.log' "SELECT \\* FROM projects|SELECT p\\.\\*|INSERT INTO projects|UPDATE projects SET|DELETE FROM projects|FROM projects p|JOIN projects\\s+p|FROM projects WHERE|projects WHERE" api`

