-- AI Banlist Predictor - Cloudflare D1 SQL Schema

-- 地圖清單
CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- 求生者清單
CREATE TABLE IF NOT EXISTS survivors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- 監管者清單
CREATE TABLE IF NOT EXISTS hunters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- 戰績記錄
CREATE TABLE IF NOT EXISTS match_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_name TEXT NOT NULL,
    ban_survivors TEXT NOT NULL, -- 儲存 JSON array string: '["機械師", "咒術師"]'
    hunter_name TEXT NOT NULL,
    version TEXT NOT NULL,
    badge_level TEXT DEFAULT 'C',
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'feedback_frontend'
);

-- 系統配置 (版本號等)
CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化預設版本
INSERT OR IGNORE INTO configs (key, value) VALUES ('current_version', 'Season 41');

-- 建立索引以加速預測與後台查詢
CREATE INDEX IF NOT EXISTS idx_records_map ON match_records(map_name);
CREATE INDEX IF NOT EXISTS idx_records_reported ON match_records(reported_at DESC);
