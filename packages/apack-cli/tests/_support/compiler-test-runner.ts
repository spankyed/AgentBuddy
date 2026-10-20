/** Runtime/process and live watcher tests belong on disposable Macs, even inside a unit suite. */
export function assertCompilerTestRunner(platform = process.platform, env: NodeJS.ProcessEnv = process.env): void {
  if (platform !== 'darwin' || (env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted')) return;
  throw new Error('Compiler runtime, native fixture and live watcher tests require a disposable runner. Run it on a disposable GitHub-hosted runner, not this Mac. Use gh workflow run ci.yml --ref <branch> -f compiler_macos=true for focused native checks; run the full integration gate in disposable CI. Pure unit tests and ordinary development remain available locally.');
}
