import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withCheckoutProfile } from './lib/dev-profile.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../packages/apack-cli/bin/apack.mjs', import.meta.url)),
  'db', ...withCheckoutProfile(root, process.argv.slice(2)),
], { cwd: root, stdio: 'inherit' });
process.on('SIGINT', () => {});
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (signal) { process.removeAllListeners(signal); process.kill(process.pid, signal); }
  else process.exitCode = code ?? 1;
});
