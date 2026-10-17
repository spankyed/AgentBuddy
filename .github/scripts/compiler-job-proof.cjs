// Native acceptance for the production compiler launcher, before dependency installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

if (process.platform !== 'win32') throw new Error('This proof requires Windows');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-job-proof-'));
const { spawnCompilerWorker } = require('../../packages/apack-cli/src/build/compiler-process.ts');
const compiler = { executable: process.execPath, bin: path.resolve(__dirname, '../../packages/apack-cli/bin/apack.mjs') };
const worker = path.join(root, 'worker with spaces 雪.cjs');
fs.writeFileSync(worker, `
const {spawn} = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'process.send(process.pid); setInterval(() => {}, 1000);'], {stdio: ['ignore','ignore','ignore','ipc']});
child.once('message', childPid => process.send({pid:process.pid, childPid, args:process.argv.slice(2), cwd:process.cwd(), marker:process.env.APACK_JOB_PROOF}));
process.once('message', code => process.exit(code));
console.log('inherited-stdout'); console.error('inherited-stderr');
`);
const gone = pid => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw error; }
};
const launchers = new Set();
async function scenario(code) {
  const args = ['space and & literal', 'quoted"value\\', 'Grüße 雪🧩'];
  const workspace = path.join(root, 'launch-' + code);
  const launcher = spawnCompilerWorker(compiler, [worker, ...args], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, APACK_JOB_PROOF: 'preserved' },
  }, workspace);
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
