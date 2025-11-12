const { spawnSync, spawn } = require('child_process');
const path = require('path');

const node = process.execPath;
const cliPath = path.join(__dirname, '..', 'cli.js');
const fs = require('fs');
// Remove any existing DB to start tests from clean slate
try { fs.unlinkSync(path.join(process.cwd(), 'queuectl.db')); } catch (e) { /* ignore */ }
try { fs.unlinkSync(path.join(__dirname, '..', 'queuectl.db')); } catch (e) { /* ignore */ }

function runArgs(args) {
  console.log('>', node, cliPath, ...args);
  const res = spawnSync(node, [cliPath, ...args], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) throw new Error('Command failed: ' + args.join(' '));
}

try {
  // Use programmatic args to avoid shell quoting issues
  runArgs(['enqueue', JSON.stringify({ id: 'ok1', command: 'echo done' })]);

  // a job that will fail quickly - command depends on platform
  const failCmd = process.platform === 'win32' ? 'cmd /c exit 1' : 'bash -c "exit 1"';
  runArgs(['enqueue', JSON.stringify({ id: 'fail1', command: failCmd, max_retries: 2 })]);

  runArgs(['list', '--state', 'pending']);

  console.log('Start worker for a few seconds...');
  const worker = spawn(node, [cliPath, 'worker:start', '--count', '1'], { stdio: 'inherit' });
  // let it run for 4 seconds then kill
  setTimeout(() => {
    try { worker.kill(); } catch (e) { /* ignore */ }
    console.log('Worker stopped');
    try {
      runArgs(['status']);
    } catch (e) {
      console.error('Status command failed:', e.message);
    }
  }, 4000);
} catch (err) {
  console.error('Test run failed:', err.message);
  process.exit(1);
}
