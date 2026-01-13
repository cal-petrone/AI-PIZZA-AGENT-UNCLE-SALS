const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database in data/ directory (gitignored)
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'calls.db');

// Ensure directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Create calls table (idempotent - safe to run multiple times)
db.exec(`
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_sid TEXT UNIQUE NOT NULL,
    client_slug TEXT NOT NULL,
    call_date TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    minutes_used REAL NOT NULL,
    answered INTEGER NOT NULL DEFAULT 1,
    ai_handled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_client_date ON calls(client_slug, call_date);
  CREATE INDEX IF NOT EXISTS idx_call_sid ON calls(call_sid);
`);

// Helper functions
const logCall = db.prepare(`
  INSERT OR IGNORE INTO calls 
  (call_sid, client_slug, call_date, duration_sec, minutes_used, answered, ai_handled)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getStats = db.prepare(`
  SELECT 
    SUM(minutes_used) as total_minutes,
    COUNT(*) as call_count
  FROM calls
  WHERE client_slug = ? AND call_date >= ?
`);

const getDailyStats = db.prepare(`
  SELECT 
    call_date,
    SUM(minutes_used) as minutes
  FROM calls
  WHERE client_slug = ? AND call_date >= date('now', '-7 days')
  GROUP BY call_date
  ORDER BY call_date ASC
`);

const getDailyCallCounts = db.prepare(`
  SELECT 
    call_date,
    COUNT(*) as call_count
  FROM calls
  WHERE client_slug = ? AND call_date >= date('now', '-7 days')
  GROUP BY call_date
  ORDER BY call_date ASC
`);

module.exports = {
  db,
  logCall,
  getStats,
  getDailyStats,
  getDailyCallCounts
};

