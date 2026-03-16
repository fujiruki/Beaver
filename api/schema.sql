-- Beaver schema.sql
-- 初回DB作成時に自動実行される

PRAGMA foreign_keys = ON;

-- =========================================================
-- 自社情報・システム設定（1レコードのみ）
-- =========================================================
CREATE TABLE IF NOT EXISTS company_settings (
    id                       INTEGER PRIMARY KEY DEFAULT 1,
    company_name             TEXT NOT NULL DEFAULT '',
    company_name_kana        TEXT,
    postal_code              TEXT(8),
    address1                 TEXT,
    address2                 TEXT,
    tel                      TEXT(15),
    fax                      TEXT(15),
    email                    TEXT,
    invoice_registration_no  TEXT,       -- インボイス登録番号
    bank_info                TEXT,       -- 振込先
    invoice_header_note      TEXT,       -- 見積書備考欄テキスト
    quantity_decimal_digits  INTEGER NOT NULL DEFAULT 0,
    tax_decimal_digits       INTEGER NOT NULL DEFAULT 0,
    default_profit_rate      REAL NOT NULL DEFAULT 0.30,  -- デフォルト利益率
    default_labor_rate       REAL NOT NULL DEFAULT 5000,  -- 労務単価（円/時間）
    updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO company_settings (id) VALUES (1);

-- =========================================================
-- 消費税率マスタ
-- =========================================================
CREATE TABLE IF NOT EXISTS tax_rates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    valid_from  DATE NOT NULL,
    rate        REAL NOT NULL
);
INSERT OR IGNORE INTO tax_rates (id, valid_from, rate) VALUES (1, '1989-04-01', 0.03);
INSERT OR IGNORE INTO tax_rates (id, valid_from, rate) VALUES (2, '1997-04-01', 0.05);
INSERT OR IGNORE INTO tax_rates (id, valid_from, rate) VALUES (3, '2014-04-01', 0.08);
INSERT OR IGNORE INTO tax_rates (id, valid_from, rate) VALUES (4, '2019-10-01', 0.10);

-- =========================================================
-- 得意先マスタ
-- =========================================================
CREATE TABLE IF NOT EXISTS customers (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    code                  TEXT(20) UNIQUE,
    name                  TEXT NOT NULL,
    name_kana             TEXT,
    honorific_type        TEXT(5) DEFAULT '御中',
    gender                TEXT(5),
    postal_code           TEXT(8),
    address1              TEXT(50),
    address2              TEXT(50),
    tel                   TEXT(15),
    mobile                TEXT(15),
    fax                   TEXT(15),
    email                 TEXT(50),
    memo                  TEXT,
    billing_name          TEXT(50),
    billing_date_print    INTEGER NOT NULL DEFAULT 0,
    cutoff_day            INTEGER NOT NULL DEFAULT 31, -- 31=月末
    billing_offset_days   INTEGER NOT NULL DEFAULT 15,
    payment_due_days      INTEGER NOT NULL DEFAULT 30,
    carry_forward_balance REAL NOT NULL DEFAULT 0,
    is_active             INTEGER NOT NULL DEFAULT 1,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- =========================================================
-- 案件（現場）
-- =========================================================
CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'active', -- active / completed / cancelled
    start_date  DATE,
    end_date    DATE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- =========================================================
-- 建具台帳（オーダーメイド建具マスタ）
-- =========================================================
CREATE TABLE IF NOT EXISTS tategu_items (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    code                 TEXT(20) UNIQUE,
    name                 TEXT NOT NULL,
    description          TEXT,
    base_catalog_item_id INTEGER,           -- catalog-system items.id（nullable）
    status               TEXT NOT NULL DEFAULT 'active', -- active / archived
    -- 原価スナップショット
    cost_body            REAL NOT NULL DEFAULT 0,
    cost_hardware        REAL NOT NULL DEFAULT 0,
    cost_glass           REAL NOT NULL DEFAULT 0,
    cost_factory_hours   REAL NOT NULL DEFAULT 0,
    cost_site_hours      REAL NOT NULL DEFAULT 0,
    cost_labor_rate      REAL NOT NULL DEFAULT 0,
    cost_snapshot_at     DATETIME,
    -- その他
    building_image_path  TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tategu_code ON tategu_items(code);
CREATE INDEX IF NOT EXISTS idx_tategu_status ON tategu_items(status);

-- =========================================================
-- 建具台帳 追加工程・特殊加工
-- =========================================================
CREATE TABLE IF NOT EXISTS tategu_item_additions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    tategu_item_id     INTEGER NOT NULL REFERENCES tategu_items(id) ON DELETE CASCADE,
    line_no            INTEGER NOT NULL,
    line_type          TEXT NOT NULL, -- 'catalog_item' | 'manual'
    catalog_item_id    INTEGER,
    name               TEXT NOT NULL,
    cost_body          REAL NOT NULL DEFAULT 0,
    cost_hardware      REAL NOT NULL DEFAULT 0,
    cost_glass         REAL NOT NULL DEFAULT 0,
    cost_factory_hours REAL NOT NULL DEFAULT 0,
    cost_site_hours    REAL NOT NULL DEFAULT 0,
    cost_labor_rate    REAL NOT NULL DEFAULT 0,
    memo               TEXT,
    UNIQUE(tategu_item_id, line_no)
);

-- =========================================================
-- 見積・売上伝票（統合）
-- =========================================================
CREATE TABLE IF NOT EXISTS vouchers (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_no            TEXT UNIQUE,
    voucher_type          TEXT NOT NULL, -- 'estimate' | 'sales'
    status                TEXT NOT NULL DEFAULT 'draft',
                                         -- draft/submitted/approved/void/billed
    project_id            INTEGER REFERENCES projects(id),
    customer_id           INTEGER NOT NULL REFERENCES customers(id),
    -- 日付
    voucher_date          DATE NOT NULL,
    delivery_date         DATE,
    -- 税設定（伝票単位）
    tax_input_type        TEXT NOT NULL DEFAULT 'exclusive',
                                         -- 'exclusive'=税抜 / 'inclusive'=税込
    consumption_tax_type  TEXT NOT NULL DEFAULT '外税/伝票計',
    -- 請求情報
    cutoff_date           DATE,
    billing_date          DATE,
    override_billing_date DATE,          -- 指定請求日（NULLなら通常サイクル）
    -- 見積→売上変換
    source_voucher_id     INTEGER REFERENCES vouchers(id),
    source_estimate_no    TEXT,
    -- 印字設定
    print_date_flag       INTEGER NOT NULL DEFAULT 1,
    print_tax_excl_flag   INTEGER NOT NULL DEFAULT 0,
    print_company_seal    INTEGER NOT NULL DEFAULT 0,
    -- 取引区分
    trade_type            TEXT DEFAULT '掛売上',
    -- 設定
    profit_rate           REAL DEFAULT 0.30,
    -- テキスト
    memo                  TEXT,
    description           TEXT,
    -- 集計（更新時に再計算）
    subtotal_taxable      REAL NOT NULL DEFAULT 0,
    subtotal_nontaxable   REAL NOT NULL DEFAULT 0,
    subtotal_discount     REAL NOT NULL DEFAULT 0,
    tax_amount            REAL NOT NULL DEFAULT 0,
    total_amount          REAL NOT NULL DEFAULT 0,
    -- 管理
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_customer ON vouchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_project ON vouchers(project_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_billing ON vouchers(billing_date, override_billing_date);

-- =========================================================
-- 見積・売上明細（統合）
-- =========================================================
CREATE TABLE IF NOT EXISTS voucher_lines (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id          INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    line_no             INTEGER NOT NULL,
    line_type           TEXT NOT NULL DEFAULT 'normal', -- normal / discount / subtotal
    -- 取付場所
    location_no         INTEGER,
    location_name       TEXT(30),
    -- 建具台帳参照
    tategu_item_id      INTEGER REFERENCES tategu_items(id),
    item_name           TEXT(60),
    quantity            INTEGER NOT NULL DEFAULT 1,
    -- 原価スナップショット（建具台帳選択時点で保存）
    cost_body           REAL NOT NULL DEFAULT 0,
    cost_hardware       REAL NOT NULL DEFAULT 0,
    cost_glass          REAL NOT NULL DEFAULT 0,
    cost_factory_hours  REAL NOT NULL DEFAULT 0,
    cost_site_hours     REAL NOT NULL DEFAULT 0,
    cost_labor_rate     REAL NOT NULL DEFAULT 0,
    snapshot_loaded_at  DATETIME,
    -- 売価
    price_body          REAL NOT NULL DEFAULT 0,
    price_hardware      REAL NOT NULL DEFAULT 0,
    price_glass         REAL NOT NULL DEFAULT 0,
    line_total          REAL NOT NULL DEFAULT 0,
    -- 税区分
    tax_category        TEXT NOT NULL DEFAULT '課税',
    memo                TEXT(16),
    UNIQUE(voucher_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_tategu ON voucher_lines(tategu_item_id);

-- =========================================================
-- 請求書・売掛
-- =========================================================
CREATE TABLE IF NOT EXISTS invoices (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no         TEXT UNIQUE,
    customer_id        INTEGER NOT NULL REFERENCES customers(id),
    invoice_date       DATE NOT NULL,
    cutoff_date        DATE NOT NULL,
    billing_date       DATE NOT NULL,
    carry_forward      REAL NOT NULL DEFAULT 0,
    sales_total        REAL NOT NULL DEFAULT 0,
    tax_total          REAL NOT NULL DEFAULT 0,
    payment_received   REAL NOT NULL DEFAULT 0,
    invoice_total      REAL NOT NULL DEFAULT 0,
    next_carry_forward REAL NOT NULL DEFAULT 0,
    billing_name_print TEXT,
    pdf_path           TEXT,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_billing ON invoices(billing_date);

-- =========================================================
-- 請求書 ↔ 売上伝票 紐づけ
-- =========================================================
CREATE TABLE IF NOT EXISTS invoice_vouchers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    voucher_id  INTEGER NOT NULL REFERENCES vouchers(id),
    UNIQUE(invoice_id, voucher_id)
);

-- =========================================================
-- 入金
-- =========================================================
CREATE TABLE IF NOT EXISTS payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_no   TEXT UNIQUE,
    customer_id  INTEGER NOT NULL REFERENCES customers(id),
    invoice_id   INTEGER REFERENCES invoices(id),
    payment_date DATE NOT NULL,
    amount       REAL NOT NULL DEFAULT 0,
    payment_type TEXT NOT NULL DEFAULT '現金',
    memo         TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- =========================================================
-- 伝票番号連番管理
-- =========================================================
CREATE TABLE IF NOT EXISTS sequences (
    key     TEXT PRIMARY KEY,
    last_no INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0);
INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('sales', 0);
INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('invoice', 0);
INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('payment', 0);
