const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Use a path relative to this source file so the DB lives in the project root
// regardless of the current working directory when `node` is run.
const DB_PATH = path.join(__dirname, '..', 'queuectl.db');
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '');

const db = new Database(DB_PATH);

function init() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_error TEXT,
      worker_id TEXT,
      locked_at TEXT,
      next_attempt_at TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  // Use parameterized queries and single-quoted literals to avoid SQL parsing issues
  const hasBase = db.prepare('SELECT 1 FROM config WHERE key = ?').get('backoff_base');
  if (!hasBase) {
    const insert = db.prepare('INSERT INTO config(key,value) VALUES(?,?),(?,?)');
    insert.run('backoff_base', '2', 'default_max_retries', '3');
  }
}
init();

module.exports = { db };
