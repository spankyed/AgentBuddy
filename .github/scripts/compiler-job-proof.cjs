// Windows-native prototype; no production compiler path uses this launcher yet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

if (process.platform !== 'win32') throw new Error('This proof requires Windows');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-job-proof-'));
const script = path.join(__dirname, 'compiler-job-proof.ps1');
const worker = path.join(root, 'worker with spaces.cjs');
fs.writeFileSync(worker, `
const {spawn} = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'process.send(process.pid); setInterval(() => {}, 1000);'], {stdio: ['ignore','ignore','ignore','ipc']});
child.once('message', childPid => process.send({pid:process.pid, childPid, args:process.argv.slice(2), cwd:process.cwd(), marker:process.env.APACK_JOB_PROOF}));
process.once('message', code => process.exit(code));
console.log('inherited-stdout'); console.error('inherited-stderr');
`);
const quote = value => '"' + value.replace(/(\\*)"/g, (_, slashes) => slashes.repeat(2) + '\\"').replace(/(\\+)$/, '$1$1') + '"';
const gone = pid => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw error; }
};
const launchers = new Set();
async function scenario(code) {
  const args = ['space and & literal', 'quoted"value\\'];
  const configuration = path.join(root, `launch-${code}.json`);
  fs.writeFileSync(configuration, JSON.stringify({ executable: process.execPath,
    commandLine: [process.execPath, worker, ...args].map(quote).join(' '), cwd: root, parentPid: process.pid }));
  const launcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Configuration', configuration], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, APACK_JOB_PROOF: 'preserved', TMP: root, TEMP: root },
  });
  launchers.add(launcher);
  let stdout = '', stderr = '';
  launcher.stdout.on('data', bytes => stdout += bytes);
  launcher.stderr.on('data', bytes => stderr += bytes);
  const closed = once(launcher, 'close');
  launcher.once('close', () => launchers.delete(launcher));
  const ready = await Promise.race([
    once(launcher, 'message').then(([value]) => value),
    closed.then(([exit, signal]) => { throw new Error(`Launcher exited before IPC: ${exit}/${signal}\n${stderr}`); }),
  ]);
  assert.notEqual(ready.pid, launcher.pid);
  assert.deepEqual(ready.args, args);
  assert.equal(ready.cwd.toLowerCase(), root.toLowerCase());
  assert.equal(ready.marker, 'preserved');
  assert.equal(gone(ready.childPid), false);
  if (code === 'cancel') launcher.kill('SIGKILL');
  else launcher.send(code);
  const [exit, signal] = await closed;
  launchers.delete(launcher);
  if (code === 'cancel') assert.equal(signal, 'SIGKILL');
  else assert.equal(exit, code, stderr);
  assert.equal(gone(ready.pid), true, 'Root compiler remains alive');
  assert.equal(gone(ready.childPid), true, 'Compiler descendant remains alive');
  assert.match(stdout, /inherited-stdout/);
  assert.match(stderr, /inherited-stderr/);
  console.log(JSON.stringify({ scenario: code, exit, signal, root: ready.pid, child: ready.childPid, stopped: true }));
}
let timer;
Promise.race([
  (async () => { for (const code of [0, 7, 'cancel']) await scenario(code); })(),
  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Windows job proof exceeded 30 seconds')), 30_000); }),
]).finally(async () => {
  clearTimeout(timer);
  const closed = [...launchers].map(launcher => once(launcher, 'close'));
  for (const launcher of launchers) launcher.kill('SIGKILL');
  await Promise.all(closed);
  fs.rmSync(root, { recursive: true, force: true });
}).catch(error => { console.error(error); process.exitCode = 1; });
