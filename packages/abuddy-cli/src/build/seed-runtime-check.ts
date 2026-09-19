import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOAD_TIMEOUT_MS = 60_000;
/**
 * Optional @abuddy/sdk peers every dependent's unit tests have: @abuddy/testing/harness compiles
 * seeds with @abuddy/sdk/build, which needs them (the scaffold installs typescript; @abuddy/testing's
 * tsx brings esbuild).
 */
const HARNESS_PEERS = ['typescript', 'esbuild'];

// Resolve hook for the check: @abuddy/sdk's optional peers aren't installed for every dependent
const BLOCK_OPTIONAL_PEERS_HOOK = `
let blocked = [];
export function initialize(data) { blocked = data.blocked; }
export async function resolve(specifier, context, next) {
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  if (blocked.includes(name)) {
    throw new Error(\`\${context.parentURL} imports "\${specifier}", an optional peer of @abuddy/sdk that packs depending on this one may not have installed\`);
  }
  return next(specifier, context);
}
`;

// What a dependent's unit tests do with the bundle (@abuddy/testing/harness setupPackTests)
const LOAD_SCRIPT = `
import { register } from 'node:module';
const [hook, bundle, blocked] = JSON.parse(process.env.ABUDDY_SEED_RUNTIME_CHECK);
register(hook, { data: { blocked } });
const { registerSeedRuntime, startTestRuntime } = await import('@abuddy/sdk/testing');
startTestRuntime();
const { seedRuntime } = await import(bundle);
registerSeedRuntime(seedRuntime);
`;

/** @abuddy/sdk's optional peer dependencies a dependent's unit tests may not have, as the pack resolves the SDK */
function missingSdkPeers(packDir: string): string[] {
  const manifest = createRequire(path.join(packDir, 'package.json')).resolve('@abuddy/sdk/package.json');
  const { peerDependenciesMeta = {} } = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as {
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };
  return Object.entries(peerDependenciesMeta)
    .filter(([name, meta]) => meta.optional && !HARNESS_PEERS.includes(name))
    .map(([name]) => name);
}

/**
 * Loads a built seed runtime the way a dependent's unit tests do: in a fresh Node process, with
 * only the pack's @abuddy/sdk and none of the SDK's optional peers the harness doesn't need. A bundle that can't load there
 * (a native module, an optional peer, code that needs the app) fails the build instead of a
 * dependent's tests.
 */
export async function checkSeedRuntimeLoads(
  packDir: string,
  bundleFile: string,
  { tmpDir = os.tmpdir() }: { tmpDir?: string } = {},
): Promise<{ success: boolean; error?: string }> {
  // The load's user data dir, removed after
  const dataDir = fs.mkdtempSync(path.join(tmpDir, 'abuddy-seed-runtime-check-'));
  try {
    const args = [
      // The bundle loads the packages' published dist, as a dependent's tests do
      '--input-type=module',
      '--eval',
      LOAD_SCRIPT,
    ];
    let blocked: string[];
    try {
      blocked = missingSdkPeers(packDir);
    } catch (err) {
      return {
        success: false,
        error: `${path.relative(packDir, bundleFile)} can't be checked: @abuddy/sdk doesn't resolve from ${packDir} (install the pack's dependencies).\n${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const check = JSON.stringify([`data:text/javascript,${encodeURIComponent(BLOCK_OPTIONAL_PEERS_HOOK)}`, pathToFileURL(bundleFile).href, blocked]);

    const { code, output } = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: packDir,
        // Without the caller's source condition: the bundle loads the packages' published dist, as a
        // dependent's tests do, and a run that carries the condition (npm test, PACK_DIR=…) would
        // otherwise make this child resolve TypeScript source with no loader to read it
        env: {
          ...process.env,
          NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS),
          ABUDDY_ENV: 'test',
          ABUDDY_USER_DATA_DIR: dataDir,
          ABUDDY_SEED_RUNTIME_CHECK: check,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: LOAD_TIMEOUT_MS,
      });
      let output = '';
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (exitCode) => resolve({ code: exitCode, output }));
    });
    if (code === 0) return { success: true };
    const reason = output.trim() || `the load exited with code ${code} (timed out after ${LOAD_TIMEOUT_MS / 1000}s?)`;
    return {
      success: false,
      error: `${path.relative(packDir, bundleFile)} doesn't load outside the app. Packs depending on this one load it in their unit tests with only @abuddy/sdk installed, so repositories and seed hooks can't use native modules or @abuddy/sdk's optional peers (${blocked.join(', ')}).\n${reason}`,
    };
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
