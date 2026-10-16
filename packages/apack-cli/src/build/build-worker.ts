import { errorMessage } from '@apackdev/sdk/utils/pure';
import { readCompilerInstallationInputs } from './compiler-installation.ts';
import { cliPackageDirectory } from './tool-identity.ts';
import { reportPackBuildCandidate } from './build-publication.ts';

if (process.env.APACK_BUILD_WORKER !== '1' || !process.send || !process.connected) {
  throw new Error('Pack build worker requires its parent IPC channel');
}
delete process.env.APACK_BUILD_WORKER;
const disconnected = () => process.exit(1);
process.once('disconnect', disconnected);
try {
  const compiler = readCompilerInstallationInputs();
  if (!compiler?.packages.includes(cliPackageDirectory())) throw new Error('Pack build worker requires captured compiler inputs');
  const { preparePackBuild } = await import('../commands/build.ts');
  const candidate = await preparePackBuild(process.argv.slice(4), process.cwd());
  await reportPackBuildCandidate(candidate);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
} finally {
  process.removeListener('disconnect', disconnected);
  if (process.connected) process.disconnect();
}

// End pack-created timers/tasks before the parent verifies and publishes the candidate. Drain diagnostics
// first; natural event-loop shutdown would let arbitrary background tasks retain this compiler forever.
await new Promise<void>(resolve => process.stdout.write('', () => resolve()));
await new Promise<void>(resolve => process.stderr.write('', () => resolve()));
process.exit(process.exitCode ?? 0);
