/** Advisory only: driving an intentionally stale build remains supported. */
import * as fs from 'node:fs';
import path from 'node:path';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';
import { inputFiles, repoRelative, skipsFingerprint, REPO_ROOT } from '@apackdev/host/build/packages-built';
import { CHAIN_STEPS } from './lib/chain-steps.ts';
import { unitFor } from './lib/chain-stamps.ts';

interface Edge { readonly file: string; readonly at: number }

/** Runtime builds retain their separate, best-effort timestamp nudge. */
function newest(targets: readonly string[], prune = false): Edge | undefined {
  let found: Edge | undefined;
  for (const target of targets) {
    for (const file of inputFiles(target)) {
      if (prune && skipsFingerprint(file)) continue;
      const at = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs;
      if (at !== undefined && (found === undefined || at > found.at)) found = { file, at };
    }
  }
  return found;
}

export function stalenessWarnings(): string[] {
  const warnings: string[] = [];
  const root = path.join(REPO_ROOT, 'packages/default-setup');
  try {
    assertPackBuildInputsCurrent(root, readPackBuildInputs(path.join(root, 'dist')));
  } catch (error) {
    warnings.push(`the pack the app ships: ${error instanceof Error ? error.message : String(error)} — \`npm run build:default-setup\``);
  }
  const runtime = CHAIN_STEPS.find(step => step.name === 'build:runtime')!;
  const unit = unitFor(runtime);
  const source = newest(unit.inputs, true);
  const built = newest(unit.outputs);
  if (source && built && source.at > built.at) {
    warnings.push(`the renderer, main, preload and the API: ${repoRelative(source.file)} is newer than the build — \`npm run build:runtime\``);
  }
  return warnings;
}

function main(): void {
  const warnings = stalenessWarnings();
  if (warnings.length === 0) return;
  console.warn('\n⚠ Build checks for the app you are about to drive:');
  for (const warning of warnings) console.warn(`    ${warning}`);
  console.warn('  Continuing with the selected build.\n');
}

if (import.meta.filename === process.argv[1]) main();
