/**
 * Whether this machine may run the compiler-runtime, native-fixture and live-watcher suites directly.
 *
 * Not on a daily-use Mac: every captured compiler installation materializes and executes a fresh copy of the
 * Node runtime and its addons, and macOS security-assesses each new executable path. Hundreds per run is the
 * pattern recorded alongside system-wide stalled app launches (`docs/references/evidence/build-input-snapshot-proof.md`,
 * "macOS launch-policy investigation"). Linux has no first-launch assessment, and a GitHub-hosted runner is
 * disposable. On a Mac those suites run in the Linux test container instead (`npm run test:linux`).
 *
 * One predicate for the suites' own guard and for the chain, which routes those steps into the container, so
 * the two cannot disagree about where they run.
 */
export const compilerTestsRunHere = (platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): boolean =>
  platform !== 'darwin' || (env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted');
