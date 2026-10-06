import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CONSUMER_MATRIX, PACKAGES_BUILT, TSC_VERSIONS, installPublishedPackages } from '../src/published-packages.ts';

/** Every export of the packed @abuddy/ears, @abuddy/sdk and @abuddy/ui resolves to declarations for consumers. */
let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
});
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

/**
 * Turn the event loop between cases.
 *
 * A pool worker runs each case synchronously and `await`ing a resolved promise only drains microtasks, so a
 * file of synchronous cases is **one** event-loop block however many `it`s it holds — and a worker that
 * never turns its loop cannot read the reply to the `onTaskUpdate` it has already sent. birpc's window is
 * 60s and no config can widen it, so the run fails with `[vitest-worker]: Timeout calling` while every
 * test passes.
 *
 * Found by `npm run measure:loop` on 2026-10-06, which is what that command is for: this file read
 * 9.1s out of four cases of ~550ms each — a sum being reported as a block, not a slow file.
 *
 * **It came down to 5.6s rather than to one case, and the remainder is the `beforeAll` above.**
 * `installPublishedPackages()` is three `npm pack`s and three untars through `execFileSync`, so it is one
 * synchronous block that no `afterEach` can break up; the hook caps the *cases*, and a setup like that is
 * the floor under them. Headroom went from 6.6x to 10.7x slower before it breaches. Making that setup cheaper
 * or shared is the only thing left here — three files in this half call it independently, unmemoised.
 */
afterEach(() => new Promise<void>((resolve) => { setImmediate(resolve); }));

describe.skipIf(!PACKAGES_BUILT)('published package exports', () => {
  it.each(CONSUMER_MATRIX)('all resolve to declarations under TypeScript $tsc, moduleResolution $moduleResolution', ({ tsc, moduleResolution }) => {
    const specifiers = [...codeExports('ears'), ...codeExports('sdk'), ...codeExports('ui')];
    // Every export is code but these: the manifests and the schema. A new export without declarations lands
    // in this list and fails here. The SDK's source-only `./runtime/internals` is not among them because the
    // published manifest has no such entry — `publishedManifest` drops one the source condition was the whole of
    expect(nonCodeExports('ears')).toEqual(['./package.json']);
    expect(nonCodeExports('sdk')).toEqual(['./package.json', './abuddy.schema.json']);
    expect(nonCodeExports('ui')).toEqual(['./package.json']);
    expect(specifiers).toEqual(expect.arrayContaining(['@abuddy/ears', '@abuddy/ears/lmdb', '@abuddy/sdk/repositories', '@abuddy/sdk/events', '@abuddy/sdk/templates', '@abuddy/ui/components/tiptap/TiptapEditor']));
    // Packs send with @abuddy/sdk/events; the host's transport and API client aren't an entry
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
  });
});
