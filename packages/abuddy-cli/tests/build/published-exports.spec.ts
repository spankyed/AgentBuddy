import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT, installPublishedPackages } from '../helpers/published-packages';

/** Every export of the packed @abuddy/sdk and @abuddy/ui resolves to declarations for consumers. */
const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

/** Export subpaths a consumer imports as code: not metadata, and not the source-only host hook. */
function codeExports(name: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(consumer!, 'node_modules', '@abuddy', name, 'package.json'), 'utf-8'));
  return Object.entries(manifest.exports as Record<string, unknown>)
    .filter(([key, target]) => !key.endsWith('.json') && typeof target === 'object' && target !== null && 'types' in target)
    .map(([key]) => `@abuddy/${name}${key.slice(1)}`);
}

describe.skipIf(!PACKAGES_BUILT)('published package exports', () => {
  it.each(['node16', 'bundler'] as const)('all resolve to declarations under moduleResolution %s', (moduleResolution) => {
    const specifiers = [...codeExports('sdk'), ...codeExports('ui')];
    expect(specifiers.length).toBeGreaterThan(100);
    fs.writeFileSync(path.join(consumer!, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
    fs.writeFileSync(path.join(consumer!, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: moduleResolution === 'node16' ? 'node16' : 'esnext', moduleResolution,
        strict: true, skipLibCheck: true, noEmit: true, types: [], lib: ['ES2022', 'DOM'],
        // An unresolved import would be an error; an import that resolved to JS without types would be `any`
        noImplicitAny: true,
      },
      include: ['exports.ts'],
    }));
    fs.writeFileSync(path.join(consumer!, 'exports.ts'), specifiers
      .map((specifier, i) => `export * as m${i} from '${specifier}';`)
      .join('\n'));

    let output = '';
    try {
      execFileSync(TSC, ['-p', consumer!], { stdio: 'pipe' });
    } catch (err: any) {
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    expect(output).toBe('');
  }, 120_000);
});
