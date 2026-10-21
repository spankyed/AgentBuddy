import { compilerTestsRunHere } from '@apackdev/host/build/compiler-test-host';

/** Runtime/process and live watcher tests run on Linux or a disposable runner, even inside a unit suite. */
export function assertCompilerTestRunner(platform = process.platform, env: NodeJS.ProcessEnv = process.env): void {
  if (compilerTestsRunHere(platform, env)) return;
  throw new Error('Compiler runtime, native fixture and live watcher tests do not run directly on this Mac: each run '
    + 'executes fresh runtime copies that macOS security-assesses one by one. Run them in the Linux test container: '
    + '`npm run test:linux -- <command>` (npm run chain does this for its steps). The macOS-only native cases run on '
    + 'a disposable runner: gh workflow run ci.yml --ref <branch> -f compiler_macos=true.');
}
