#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A global, Homebrew or app-bundled `abuddy` defers to the @abuddy/cli the current project
// pins, so every pack builds with the CLI version it was written against.
function projectCli() {
  try {
    const projectPkg = createRequire(path.join(process.cwd(), 'noop.js')).resolve('@abuddy/cli/package.json');
    const projectDir = realpathSync(path.dirname(projectPkg));
    const ownDir = realpathSync(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
    return projectDir === ownDir ? null : path.join(projectDir, 'bin', 'abuddy.mjs');
  } catch {
    return null;
  }
}

const handoff = projectCli();
if (handoff) {
  await import(pathToFileURL(handoff).href);
} else {
  // The CLI loads pack TypeScript (seeds, step build code), and in the monorepo is TypeScript
  // source itself: register the CLI's own tsx instead of relying on a `tsx` binary on PATH.
  const { register } = await import('tsx/esm/api');
  register();
  // Published packages run the compiled bundle
  const bundle = new URL('../dist/cli.js', import.meta.url);
  if (!existsSync(bundle)) {
    // In a checkout, workspace @abuddy/* packages resolve to their source. Registered after tsx,
    // so it runs first and tsx resolves with the added condition. Only this process, and only the
    // CLI's own code: a pack is compiled and run against those packages' dist, so the children this
    // CLI starts for pack code (the Playwright runner, the seed-runtime check, the app) have the
    // condition stripped from NODE_OPTIONS rather than added.
    const { register: registerHooks } = await import('node:module');
    registerHooks(new URL('./source-hooks.mjs', import.meta.url), {
      data: { checkout: new URL('../../../', import.meta.url).href },
    });
    const { assertSourceResolution } = await import('@abuddy/host/build/source-resolution');
    assertSourceResolution((specifier) => fileURLToPath(import.meta.resolve(specifier)), 'The abuddy CLI');
  }
  await import(existsSync(bundle) ? bundle.href : '../src/index.ts');
}
