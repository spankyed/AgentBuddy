import { readCompilerInstallationInputs } from './compiler-installation-inputs.ts';
import { cliPackageDirectory } from './tool-identity.ts';
import { COMPILER_PROCESS_GROUP_ENV } from './compiler-process-group.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.APACK_FRONTEND_WORKER !== '1' || !process.send || !process.connected) {
  throw new Error('Pack frontend worker requires its parent IPC channel');
}
delete process.env.APACK_FRONTEND_WORKER;
const grouped = process.env[COMPILER_PROCESS_GROUP_ENV] === '1';
delete process.env[COMPILER_PROCESS_GROUP_ENV];
process.once('disconnect', () => {
  if (grouped) {
    try { process.kill(-process.pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') console.error(errorMessage(error)); }
  }
  process.exit(1);
});

try {
  const compiler = readCompilerInstallationInputs();
  if (!compiler?.packages.includes(cliPackageDirectory())) throw new Error('Pack frontend worker requires captured compiler inputs');
  const directory = process.env.APACK_FRONTEND_DIRECTORY;
  if (!directory || !path.isAbsolute(directory)) throw new Error('Pack frontend worker requires its private workspace');
  const temporary = path.join(directory, 'tmp');
  fs.mkdirSync(temporary, { recursive: true });
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = temporary;
  const { findFEEntry, packDevServerConfig } = await import('./fe-bundler.ts');
  const root = process.cwd();
  const entry = findFEEntry(root);
  if (!entry) throw new Error('Pack has no frontend entry');
  const { createServer } = await import('vite');
  const configuration = await packDevServerConfig(root, entry);
  configuration.cacheDir = path.join(directory, 'vite');
  const server = await createServer(configuration);
  process.on('message', async message => {
    if (message !== 'frontend-close') return;
    try { await server.close(); }
    finally { process.exit(0); }
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address !== 'object') throw new Error('Vite dev server failed to bind a port');
  process.send({ type: 'frontend-ready', hash: compiler.hash, port: address.port, pid: process.pid });
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
