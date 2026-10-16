import { COMPILER_PROCESS_GROUP_ENV } from './compiler-process-group.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { readCompilerInstallationInputs } from './compiler-installation-inputs.ts';
import { cliPackageDirectory } from './tool-identity.ts';
import { reportPackBuildCandidate } from './build-publication.ts';
import { compilerStartupInputs } from './compiler-startup-inputs.ts';

if (process.env.APACK_BUILD_WORKER !== '1' || !process.send || !process.connected) {
  throw new Error('Pack build worker requires its parent IPC channel');
}
delete process.env.APACK_BUILD_WORKER;
const grouped = process.env[COMPILER_PROCESS_GROUP_ENV] === '1';
delete process.env[COMPILER_PROCESS_GROUP_ENV];
const disconnected = () => {
  // With no parent left to reap the group, stop inherited subprocesses along with this worker.
  if (grouped) {
    try { process.kill(-process.pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') console.error(errorMessage(error)); }
  }
  process.exit(1);
};
process.once('disconnect', disconnected);
try {
  const compiler = readCompilerInstallationInputs();
  if (!compiler?.packages.includes(cliPackageDirectory())) throw new Error('Pack build worker requires captured compiler inputs');
  const startup = compilerStartupInputs();
  if (!startup) throw new Error('Pack build worker requires native startup inputs');
  await startup.capture();
  const { preparePackBuild } = await import('../commands/build.ts');
  const candidate = await preparePackBuild(process.argv.slice(4), process.cwd());
  await reportPackBuildCandidate(candidate);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}

// End pack-created timers/tasks before the parent verifies and publishes the candidate. Drain diagnostics
// first; natural event-loop shutdown would let arbitrary background tasks retain this compiler forever.
await new Promise<void>(resolve => process.stdout.write('', () => resolve()));
await new Promise<void>(resolve => process.stderr.write('', () => resolve()));
process.removeListener('disconnect', disconnected);
process.exit(process.exitCode ?? 0);
