import { errorMessage } from '@apackdev/sdk/utils/pure';
import { readCompilerInstallationInputs } from './compiler-installation.ts';
import { cliPackageDirectory } from './tool-identity.ts';

if (process.env.APACK_BUILD_WORKER !== '1' || !process.send || !process.connected) {
  throw new Error('Pack build worker requires its parent IPC channel');
}
delete process.env.APACK_BUILD_WORKER;
const disconnected = () => process.exit(1);
process.once('disconnect', disconnected);
try {
  const compiler = readCompilerInstallationInputs();
  if (!compiler?.packages.includes(cliPackageDirectory())) throw new Error('Pack build worker requires captured compiler inputs');
  const { build } = await import('../commands/build.ts');
  await build(process.argv.slice(4));
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
} finally {
  process.removeListener('disconnect', disconnected);
  if (process.connected) process.disconnect();
}
