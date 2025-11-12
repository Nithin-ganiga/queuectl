#!/usr/bin/env node
const { program } = require('commander');
const { enqueue, list, getConfig, setConfig } = require('./queue');
const { Worker } = require('./worker');
const { db } = require('./db');

program
  .command('enqueue <json>')
  .description('Add a job')
  .action(str => {
    const job = JSON.parse(str);
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
