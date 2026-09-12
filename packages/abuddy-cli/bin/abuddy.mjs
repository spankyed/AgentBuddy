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
  // Published packages run the compiled bundle. In the monorepo the CLI is TypeScript
  // source: register the CLI's own tsx instead of relying on a `tsx` binary on PATH.
  const bundle = new URL('../dist/cli.js', import.meta.url);
  if (existsSync(bundle)) {
    await import(bundle.href);
  } else {
    const { register } = await import('tsx/esm/api');
    register();
    await import('../src/index.ts');
  }
}
