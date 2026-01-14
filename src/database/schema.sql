-- 小红书 RPA 自动发布系统 - 数据库 Schema
-- SQLite 3

-- 账号表
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT,
  xhs_id TEXT UNIQUE,
  avatar_url TEXT,
  cookie_path TEXT,
  daily_count INTEGER DEFAULT 0,
  last_publish_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'banned', 'expired', 'pending')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 内容表
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL CHECK(type IN ('image', 'video')),
  media_paths TEXT NOT NULL,  -- JSON array: ["uploads/xxx.jpg", ...]
  cover_path TEXT,            -- 封面图路径
  tags TEXT,                  -- JSON array: ["话题1", "话题2"]
  location TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 发布计划表
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 发布日志表
CREATE TABLE IF NOT EXISTS publish_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started', 'init', 'navigate', 'upload', 'uploading', 'processing', 'cover', 'title', 'content', 'filling', 'tags', 'location', 'publish', 'publishing', 'waiting', 'success', 'failed')),
  message TEXT,
  note_url TEXT,
  screenshot_path TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_schedules_account ON schedules(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_publish_logs_schedule ON publish_logs(schedule_id);

-- 默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_limit', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('min_interval_minutes', '15');
INSERT OR IGNORE INTO settings (key, value) VALUES ('enable_ai_fallback', 'false');
