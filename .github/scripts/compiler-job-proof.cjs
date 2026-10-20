// Native acceptance for the production compiler launcher, before dependency installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { fork, spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

if (process.platform !== 'win32') throw new Error('This proof requires Windows');
const parentController = process.argv[2] === '--parent-loss';
const root = parentController ? process.argv[3] : fs.mkdtempSync(path.join(os.tmpdir(), 'apack-job-proof-'));
const { spawnCompilerWorker } = require('../../packages/apack-cli/src/build/compiler-process.ts');
const compiler = {
  executable: process.execPath,
  runtimeDirectory: path.dirname(process.execPath),
  bin: path.resolve(__dirname, '../../packages/apack-cli/bin/apack.mjs'),
};
const worker = path.join(root, 'worker with spaces 雪.cjs');
fs.writeFileSync(worker, `
const {spawn} = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'process.send(process.pid); setInterval(() => {}, 1000);'], {stdio: ['ignore','ignore','ignore','ipc']});
child.once('message', childPid => process.send({pid:process.pid, childPid, args:process.argv.slice(2), cwd:process.cwd(), marker:process.env.APACK_JOB_PROOF, modulePath:process.env.PSModulePath, policy:process.env.PSExecutionPolicyPreference, unicode:process.env.APACK_JOB_PROOF_UNICODE, unsetAbsent:!("APACK_JOB_PROOF_UNSET" in process.env)}));
process.once('message', code => process.exit(code));
console.log('inherited-stdout'); console.error('inherited-stderr');
`);
const gone = pid => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw error; }
};
const launchers = new Set();
function track(child) {
  launchers.add(child);
  const closed = once(child, 'close');
  child.once('close', () => launchers.delete(child));
  return closed;
}
async function start(name) {
  const args = ['space and & literal', 'quoted"value\\', 'Grüße 雪🧩'];
  const workspace = path.join(root, 'launch-' + name);
  const launcher = spawnCompilerWorker(compiler, [worker, ...args], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, APACK_JOB_PROOF: 'preserved', PSExecutionPolicyPreference: 'RemoteSigned',
      APACK_JOB_PROOF_UNICODE: '雪🧩\nquoted"value', APACK_JOB_PROOF_UNSET: undefined },
  }, workspace);
  let stdout = '', stderr = '';
  launcher.stdout.on('data', bytes => stdout += bytes);
  launcher.stderr.on('data', bytes => stderr += bytes);
  const closed = track(launcher);
  assert.equal(fs.readFileSync(path.join(workspace, 'job/launch.json'), 'utf8').includes('APACK_JOB_PROOF'), false, 'Environment was persisted in launcher configuration');
  const ready = await Promise.race([
    once(launcher, 'message').then(([value]) => value),
    closed.then(([exit, signal]) => { throw new Error(`Launcher exited before IPC: ${exit}/${signal}\n${stderr}`); }),
  ]);
  assert.notEqual(ready.pid, launcher.pid);
  assert.deepEqual(ready.args, args);
  assert.equal(ready.cwd.toLowerCase(), root.toLowerCase());
  assert.equal(ready.marker, 'preserved');
  assert.equal(ready.modulePath, process.env.PSModulePath);
  assert.equal(ready.policy, 'RemoteSigned');
  assert.equal(ready.unicode, '雪🧩\nquoted"value');
  assert.equal(ready.unsetAbsent, true);
  assert.equal(gone(ready.childPid), false);
  return { name, launcher, ready, closed, output: () => ({ stdout, stderr }) };
}
async function stop(session, code) {
  const { name, launcher, ready, closed } = session;
  if (code === 'cancel') launcher.kill('SIGKILL');
  else launcher.send(code);
  const [exit, signal] = await closed;
  launchers.delete(launcher);
  if (code === 'cancel') assert.equal(signal, 'SIGKILL');
  else assert.equal(exit, code, session.output().stderr);
  assert.equal(gone(ready.pid), true, 'Root compiler remains alive');
  assert.equal(gone(ready.childPid), true, 'Compiler descendant remains alive');
  assert.match(session.output().stdout, /inherited-stdout/);
  assert.match(session.output().stderr, /inherited-stderr/);
  console.log(JSON.stringify({ scenario: name, exit, signal, root: ready.pid, child: ready.childPid, stopped: true }));
}
async function helperBootstrap() {
  const script = path.join(root, 'helper.ps1'), child = path.join(root, 'helper-child.cjs');
  // The finite child also bounds a failed proof without a PID-only cleanup operation.
  fs.writeFileSync(child, 'setTimeout(() => {}, 5000);');
  const literal = value => "'" + value.replaceAll("'", "''") + "'";
  fs.writeFileSync(script, `
$ErrorActionPreference = 'Stop'
. ${literal(path.resolve(__dirname, '../../packages/apack-cli/bin/compiler-helper-job.ps1'))}
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = ${literal(process.execPath)}
$start.Arguments = ${literal('"' + child + '"')}
$start.UseShellExecute = $false
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$child = [Diagnostics.Process]::Start($start)
[Console]::Out.WriteLine($child.Id)
[Threading.Thread]::Sleep(-1)
`);
  const helper = spawn(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-File', script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const closed = track(helper);
  let stderr = '';
  helper.stderr.on('data', bytes => stderr += bytes);
  const lines = createInterface({ input: helper.stdout });
  try {
    const childPid = await Promise.race([
      once(lines, 'line').then(([line]) => Number(line)),
      closed.then(([code]) => { throw new Error(`Helper exited before readiness: ${code}\n${stderr}`); }),
    ]);
    assert.ok(Number.isInteger(childPid) && childPid > 0, 'Missing helper child PID');
    assert.equal(gone(childPid), false);
    // Descendants can retain inherited pipe handles after helper exit; don't wait for stdio closure.
    const exited = once(helper, 'exit');
    helper.kill('SIGKILL');
    await exited;
    const deadline = performance.now() + 2000;
    while (!gone(childPid) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(gone(childPid), true, 'Compiler helper descendant survived helper loss');
    await closed;
    console.log(JSON.stringify({ scenario: 'helper-bootstrap', child: childPid, stopped: true }));
  } finally { lines.close(); }
}
async function parentLoss() {
  const controller = fork(__filename, ['--parent-loss', root], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stderr = '';
  controller.stdout.resume();
  controller.stderr.on('data', bytes => stderr += bytes);
  const closed = track(controller);
  const ready = await Promise.race([
    once(controller, 'message').then(([value]) => value),
    closed.then(([exit]) => { throw new Error(`Parent-loss controller exited before readiness: ${exit}\n${stderr}`); }),
  ]);
  assert.equal(gone(ready.pid), false);
  assert.equal(gone(ready.childPid), false);
  controller.kill('SIGKILL');
  const [exit, signal] = await closed;
  assert.equal(exit, null, stderr);
  assert.equal(signal, 'SIGKILL');
  const pids = [ready.ownerPid, ready.pid, ready.childPid];
  const deadline = performance.now() + 2000;
  while (pids.some(pid => !gone(pid)) && performance.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  for (const pid of pids) assert.equal(gone(pid), true, `Process ${pid} survived parent loss`);
  console.log(JSON.stringify({ scenario: 'parent-loss', ...ready, stopped: true }));
}
async function run() {
  if (parentController) {
    const session = await start('parent-loss');
    process.send({ ...session.ready, ownerPid: session.launcher.pid });
    await new Promise(() => {});
  }
  await helperBootstrap();
  for (const code of [0, 7, 'cancel']) await stop(await start(String(code)), code);
  const previous = await start('replacement-previous');
  const replacement = await start('replacement-current');
  assert.notEqual(previous.launcher.pid, replacement.launcher.pid);
  await stop(previous, 0);
  assert.equal(gone(replacement.ready.pid), false, 'Retiring the previous compiler killed its replacement');
  assert.equal(gone(replacement.ready.childPid), false, 'Retiring the previous compiler killed a replacement descendant');
  await stop(replacement, 0);
  await parentLoss();
}
let timer;
Promise.race([
  run(),
  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Windows job proof exceeded 30 seconds')), 30_000); }),
]).finally(async () => {
  clearTimeout(timer);
  const closed = [...launchers].map(launcher => once(launcher, 'close'));
  for (const launcher of launchers) launcher.kill('SIGKILL');
  await Promise.allSettled(closed);
  if (!parentController) fs.rmSync(root, { recursive: true, force: true });
}).catch(error => { console.error(error); process.exitCode = 1; });
