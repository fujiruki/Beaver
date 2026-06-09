-- R-034 (a): vouchers.customer_id の NOT NULL 制約を外す
-- 過去伝票モード（project_id=NULL）の AccessTategu push を受け入れるため、
-- customer_id=NULL を許容する。SQLite では ALTER COLUMN ができないので
-- テーブルを作り直す。
--
-- 元の CREATE TABLE と完全に同じ列定義（customer_id の NOT NULL のみ削除）を保つこと。
-- インデックスは末尾で再作成する。

BEGIN TRANSACTION;

CREATE TABLE vouchers_new (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_no            TEXT UNIQUE,
    voucher_type          TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'draft',
    project_id            INTEGER REFERENCES projects(id),
    customer_id           INTEGER REFERENCES customers(id),
    voucher_date          DATE NOT NULL,
    delivery_date         DATE,
    tax_input_type        TEXT NOT NULL DEFAULT 'exclusive',
    consumption_tax_type  TEXT NOT NULL DEFAULT '外税/伝票計',
    cutoff_date           DATE,
    billing_date          DATE,
    override_billing_date DATE,
    source_voucher_id     INTEGER REFERENCES vouchers(id),
    source_estimate_no    TEXT,
    print_date_flag       INTEGER NOT NULL DEFAULT 1,
    print_tax_excl_flag   INTEGER NOT NULL DEFAULT 0,
    print_company_seal    INTEGER NOT NULL DEFAULT 0,
    trade_type            TEXT DEFAULT '掛売上',
    profit_rate           REAL DEFAULT 0.30,
    memo                  TEXT,
    description           TEXT,
    subtotal_taxable      REAL NOT NULL DEFAULT 0,
    subtotal_nontaxable   REAL NOT NULL DEFAULT 0,
    subtotal_discount     REAL NOT NULL DEFAULT 0,
    tax_amount            REAL NOT NULL DEFAULT 0,
    total_amount          REAL NOT NULL DEFAULT 0,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    access_voucher_id     INTEGER,
    access_voucher_no     TEXT,
    shipped               INTEGER DEFAULT 0,
    shipped_at            TEXT
);

INSERT INTO vouchers_new
    (id, voucher_no, voucher_type, status, project_id, customer_id,
     voucher_date, delivery_date, tax_input_type, consumption_tax_type,
     cutoff_date, billing_date, override_billing_date,
     source_voucher_id, source_estimate_no,
     print_date_flag, print_tax_excl_flag, print_company_seal,
     trade_type, profit_rate, memo, description,
     subtotal_taxable, subtotal_nontaxable, subtotal_discount,
     tax_amount, total_amount, created_at, updated_at,
     access_voucher_id, access_voucher_no, shipped, shipped_at)
SELECT
    id, voucher_no, voucher_type, status, project_id, customer_id,
    voucher_date, delivery_date, tax_input_type, consumption_tax_type,
    cutoff_date, billing_date, override_billing_date,
    source_voucher_id, source_estimate_no,
    print_date_flag, print_tax_excl_flag, print_company_seal,
    trade_type, profit_rate, memo, description,
    subtotal_taxable, subtotal_nontaxable, subtotal_discount,
    tax_amount, total_amount, created_at, updated_at,
    access_voucher_id, access_voucher_no, shipped, shipped_at
FROM vouchers;

DROP TABLE vouchers;
ALTER TABLE vouchers_new RENAME TO vouchers;

CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_customer ON vouchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_project ON vouchers(project_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_billing ON vouchers(billing_date, override_billing_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_access_voucher_id ON vouchers(access_voucher_id);

COMMIT;
