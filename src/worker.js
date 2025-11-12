const { db } = require('./db');
const { exec } = require('child_process');
const { getConfig } = require('./queue');

function now() { return new Date().toISOString(); }

function backoff(base, attempt) {
  return Math.min(Math.pow(base, attempt), 86400); // max 1 day
}

function claimJob(workerId) {
  const tx = db.transaction(() => {
    const job = db.prepare(`
      SELECT * FROM jobs
      WHERE state='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY created_at LIMIT 1
    `).get(now());
    if (!job) return null;
    const updated = db.prepare(`
      UPDATE jobs SET state='processing', worker_id=?, locked_at=?, updated_at=? WHERE id=? AND state='pending'
    `).run(workerId, now(), now(), job.id);
    return updated.changes ? { ...job, state: 'processing', worker_id: workerId } : null;
  });
  return tx();
}

function markCompleted(id) {
  // Include WHERE id=? so the bound id parameter is used correctly.
  db.prepare(`UPDATE jobs SET state='completed', updated_at=?, worker_id=NULL, locked_at=NULL WHERE id=?`).run(now(), id);
}

function failJob(job, err) {
  const base = Number(getConfig('backoff_base') || 2);
  const nextTry = new Date(Date.now() + backoff(base, job.attempts + 1) * 1000).toISOString();
  if (job.attempts + 1 > job.max_retries) {
    db.prepare(`UPDATE jobs SET state='dead', attempts=?, last_error=?, updated_at=? WHERE id=?`)
      .run(job.attempts + 1, err.slice(0, 300), now(), job.id);
  } else {
    db.prepare(`
      UPDATE jobs SET state='pending', attempts=?, last_error=?, next_attempt_at=?, updated_at=?, worker_id=NULL, locked_at=NULL
      WHERE id=?
    `).run(job.attempts + 1, err.slice(0, 300), nextTry, now(), job.id);
  }
}

class Worker {
  constructor(id, stopSignal) {
    this.id = id;
    this.stopSignal = stopSignal;
    this.active = false;
  }
  async run() {
    while (!this.stopSignal.stop) {
      const job = claimJob(this.id);
      if (!job) { await new Promise(r=>setTimeout(r,500)); continue; }
      this.active = true;
      await new Promise(res => {
        exec(job.command, (error, stdout, stderr) => {
          if (!error) markCompleted(job.id);
          else failJob(job, stderr || error.message);
          res();
        });
      });
      this.active = false;
    }
  }
}

module.exports = { Worker };
