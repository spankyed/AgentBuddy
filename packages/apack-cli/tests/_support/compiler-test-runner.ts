/** CLI integration exercises captured executables; keep it off daily-use Macs. */
export function assertCompilerTestRunner(platform = process.platform, env: NodeJS.ProcessEnv = process.env): void {
  if (platform !== 'darwin' || (env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted')) return;
  throw new Error('CLI integration executes captured runtimes and native fixtures. Run it on a disposable GitHub-hosted runner, not this Mac. Use gh workflow run ci.yml --ref <branch> -f compiler_macos=true for focused native checks; run the full integration gate in disposable CI. Unit tests and ordinary development remain available locally.');
}
