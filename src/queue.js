const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

function now() { return new Date().toISOString(); }

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config(key,value) VALUES(?,?)').run(key, String(value));
}

function enqueue(job) {
  const id = job.id || uuidv4();
  const command = job.command;
  const maxRetries = job.max_retries ?? Number(getConfig('default_max_retries') || 3);
  const time = now();
  db.prepare(`
    INSERT INTO jobs(id,command,state,attempts,max_retries,created_at,updated_at,next_attempt_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(id, command, 'pending', 0, maxRetries, time, time, time);
  return db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
}

function list(state) {
  return db.prepare('SELECT * FROM jobs WHERE state=? ORDER BY created_at').all(state);
}

module.exports = { enqueue, list, getConfig, setConfig };
