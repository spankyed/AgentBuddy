import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, installPublishedPackages } from '../src/published-packages.ts';

/**
 * The published declarations, checked with `skipLibCheck` off.
 *
 * Every other consumer check compiles with `skipLibCheck: true`, as a real consumer does — which is
 * the point of those specs, but it means nothing ever looks inside the `.d.ts` files we ship. An
 * error in there is invisible: a type that fails to resolve becomes `any`, and a consumer sees no
 * error at all, just a member that silently stops being checked. That is the failure this catches.
 *
 * `skipLibCheck: false` alone would also check every third-party declaration (vue, ai, xstate and
 * their trees), whose errors are not ours to fix and would make this fail for unrelated reasons. So
 * the program is built with checking on and the diagnostics are then filtered to the files under
 * `node_modules/@abuddy/`, the same way `facade-typing.spec.ts` scopes a pack's own facades.
 */

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
});
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

/** Every declaration file the three published packages ship */
function publishedDeclarations(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.vue.ts')) out.push(full);
    }
  };
  for (const pkg of ['ears', 'sdk', 'ui']) {
    const dist = path.join(root, 'node_modules', '@abuddy', pkg, 'dist');
    if (fs.existsSync(dist)) walk(dist);
  }
  return out;
}

describe.skipIf(!PACKAGES_BUILT)('the published declarations', () => {
  it('type-check on their own, so no shipped type silently resolves to any', () => {
    const declarations = publishedDeclarations(consumer!);
    expect(declarations.length, 'declarations found to check').toBeGreaterThan(100);

    const program = ts.createProgram({
      rootNames: declarations,
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
        // @abuddy/sdk/utils is Node-only by contract and its declarations name Node globals, so a
        // consumer of those modules has @types/node; without this every one reads as a missing name
        types: ['node'],
      },
    });

    // Ours only: a third-party package's own declaration errors are not this repo's to fix
    const ours = new Set(declarations.map((f) => fs.realpathSync(f)));
    const problems = program.getSourceFiles()
      .filter((file) => ours.has(fs.realpathSync(file.fileName)))
      .flatMap((file) => program.getSemanticDiagnostics(file))
      .map((d) => `${path.relative(consumer!, d.file?.fileName ?? '')}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);

    expect(problems).toEqual([]);
  });
});
