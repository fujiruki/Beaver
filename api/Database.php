<?php
/**
 * Beaver - DBラッパー
 * SQLite / MySQL を設定ファイルの DB_TYPE で切り替える
 */

require_once __DIR__ . '/config.php';

class Database {
    private static ?PDO $instance = null;

    public static function connect(): PDO {
        if (self::$instance === null) {
            if (DB_TYPE === 'mysql') {
                $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
                self::$instance = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::MYSQL_ATTR_FOUND_ROWS   => true,
                ]);
            } else {
                $isNew = !file_exists(DB_PATH);
                self::$instance = new PDO('sqlite:' . DB_PATH, null, null, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);
                self::$instance->exec('PRAGMA journal_mode=WAL');
                self::$instance->exec('PRAGMA foreign_keys=ON');
                self::$instance->exec('PRAGMA cache_size=8000');
                self::$instance->exec('PRAGMA synchronous=NORMAL');
                self::$instance->exec('PRAGMA temp_store=MEMORY');
                if ($isNew) {
                    self::initSchema(self::$instance);
                }
            }
        }
        return self::$instance;
    }

    private static function initSchema(PDO $pdo): void {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        $pdo->exec($schema);
    }
}
