#!/usr/bin/env node
const { program } = require('commander');
const { enqueue, list, getConfig, setConfig } = require('./queue');
const { Worker } = require('./worker');
const { db } = require('./db');
const fs = require('fs');

program
  .command('enqueue [json]')
  .description('Add a job. Accepts a JSON string, or use flags --id and --command, or --file <path>')
  .option('--id <id>', 'job id')
  .option('--command <cmd>', 'command to run')
  .option('--max-retries <n>', 'max retries', parseInt)
  .option('--file <path>', 'read job JSON from file')
  .action((jsonStr, opts) => {
    let job = null;
    try {
      if (opts.file) {
        const content = opts.file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(opts.file, 'utf8');
        job = JSON.parse(content);
      } else if (opts.id && opts.command) {
        job = { id: opts.id, command: opts.command };
        if (opts.maxRetries || opts.maxRetries === 0) job.max_retries = opts.maxRetries;
        if (opts.maxRetries === undefined && opts.max_retries) job.max_retries = opts.max_retries;
      } else if (jsonStr) {
        // Try to parse JSON string. If it fails, provide a friendly error.
        try {
          job = JSON.parse(jsonStr);
        } catch (e) {
          console.error('Failed to parse JSON argument. On PowerShell wrap the JSON in single quotes, e.g.:');
          console.error("  node src/cli.js enqueue '{\"id\":\"job1\", \"command\":\"echo hi\" }'");
          console.error('Or use --id and --command flags, or --file <path> to read JSON from a file.');
          process.exit(1);
        }
      } else {
        console.error('No job specified. Provide a JSON argument, or use --id and --command, or --file <path>.');
        process.exit(1);
      }
    } catch (err) {
      console.error('Error preparing job:', err.message || err);
      process.exit(1);
    }

    const j = enqueue(job);
    console.log('Enqueued:', j.id);
    });

program
  .command('worker:start')
  .option('--count <n>', 'number of workers', '1')
  .action(opts => {
    const count = parseInt(opts.count);
    const stop = { stop: false };
    console.log(`Starting ${count} worker(s)...`);
    const workers = [];
    for (let i = 0; i < count; i++) {
      const w = new Worker(`worker-${i}`, stop);
      w.run();
      workers.push(w);
    }
    process.on('SIGINT', () => { console.log('Stopping...'); stop.stop = true; });
  });

program
  .command('status')
  .action(() => {
    const rows = db.prepare('SELECT state, COUNT(*) AS cnt FROM jobs GROUP BY state').all();
    console.table(rows);
  });

program
  .command('list')
  .option('--state <s>', 'job state', 'pending')
  .action(opts => {
    console.table(list(opts.state));
  });

program
  .command('dlq:list')
  .action(() => {
    console.table(list('dead'));
  });

program
  .command('config:set <key> <val>')
  .action((k, v) => { setConfig(k, v); console.log(`Set ${k}=${v}`); });

program
  .command('config:get <key>')
  .action(k => { console.log(`${k}=${getConfig(k)}`); });

program.parse(process.argv);
  