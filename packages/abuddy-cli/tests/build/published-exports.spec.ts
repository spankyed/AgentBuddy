import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONSUMER_MATRIX, PACKAGES_BUILT, REPO_ROOT, TSC_VERSIONS, installPublishedPackages, type TscVersion } from '../helpers/published-packages';

/** Every export of the packed @abuddy/ears, @abuddy/sdk and @abuddy/ui resolves to declarations for consumers. */
let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

/** The packed package's exports, and whether each is code a consumer imports */
function exportsOf(name: string): Array<{ key: string; code: boolean }> {
  const manifest = JSON.parse(fs.readFileSync(path.join(consumer!, 'node_modules', '@abuddy', name, 'package.json'), 'utf-8'));
  return Object.entries(manifest.exports as Record<string, unknown>).map(([key, target]) => ({
    key,
    code: !key.endsWith('.json') && typeof target === 'object' && target !== null && 'types' in target,
  }));
}

/** Export subpaths a consumer imports as code: not metadata, and not a source-only host hook. */
function codeExports(name: string): string[] {
  return exportsOf(name).filter((entry) => entry.code).map(({ key }) => `@abuddy/${name}${key.slice(1)}`);
}

function nonCodeExports(name: string): string[] {
  return exportsOf(name).filter((entry) => !entry.code).map(({ key }) => key);
}

describe.skipIf(!PACKAGES_BUILT)('published package exports', () => {
  it.each(CONSUMER_MATRIX)('all resolve to declarations under TypeScript $tsc, moduleResolution $moduleResolution', ({ tsc, moduleResolution }) => {
    const specifiers = [...codeExports('ears'), ...codeExports('sdk'), ...codeExports('ui')];
    // Every export is code but these: the manifests, the schema and the SDK's source-only host hooks. A new
    // export without declarations lands in this list and fails here
    expect(nonCodeExports('ears')).toEqual(['./package.json']);
    expect(nonCodeExports('sdk')).toEqual(['./package.json', './abuddy.schema.json', './utils/internals']);
    expect(nonCodeExports('ui')).toEqual(['./package.json']);
    expect(specifiers).toEqual(expect.arrayContaining(['@abuddy/ears', '@abuddy/ears/lmdb', '@abuddy/sdk/repositories', '@abuddy/sdk/events', '@abuddy/sdk/templates', '@abuddy/ui/components/tiptap/TiptapEditor']));
    // Packs send with @abuddy/sdk/events; the host's transport and API client aren't an entry
    expect(specifiers).not.toContain('@abuddy/sdk/rpc');
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
      execFileSync(process.execPath, [TSC_VERSIONS[tsc], '-p', consumer!], { stdio: 'pipe' });
    } catch (err: any) {
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    expect(output).toBe('');
  }, 120_000);
});
