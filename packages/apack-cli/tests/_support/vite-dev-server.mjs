import path from 'node:path';
import { createServer } from 'vite';
import { packDevServerConfig } from '../../src/build/fe-bundler.ts';

process.once('disconnect', () => process.exit(1));
const [root, entry] = process.argv.slice(2);
const config = await packDevServerConfig(root, entry);
const server = await createServer({ ...config, logLevel: 'silent',
  cacheDir: path.join(root, '.apack', 'vite-test', String(process.pid)),
  server: { ...config.server, port: 0 } });
process.on('message', async message => {
  if (message !== 'close') return;
  try { await server.close(); } finally { process.exit(0); }
});
await server.listen();
process.send('ready');
