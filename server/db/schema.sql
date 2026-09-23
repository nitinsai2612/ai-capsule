-- AI Capsule database setup.
-- Executed by server/db/index.js on every start, so a fresh deployment
-- creates its own database with no manual migration step.

CREATE TABLE IF NOT EXISTS capsules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  prompt_title TEXT NOT NULL,
  prompt_version TEXT,
  prompt_text TEXT NOT NULL,
  response_summary TEXT,
  category TEXT,
  usefulness TEXT,
  reviewed INTEGER DEFAULT 0,
  improved INTEGER DEFAULT 0,
  screenshot_url TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

-- Every query is scoped by owner.
CREATE INDEX IF NOT EXISTS idx_capsules_user_id ON capsules (user_id);
CREATE INDEX IF NOT EXISTS idx_capsules_user_created ON capsules (user_id, created_at DESC);
