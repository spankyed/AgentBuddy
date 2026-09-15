import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONSUMER_MATRIX, PACKAGES_BUILT, REPO_ROOT, compileConsumer, installPublishedPackages, type TscVersion } from '../helpers/published-packages';

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

function typecheck(tsc: TscVersion, moduleResolution: 'node16' | 'bundler'): { code: number; output: string } {
  // Barrels that re-export from relative modules, as consumers use them
  return compileConsumer(consumer!, tsc, moduleResolution, { 'index.ts': [
    "import { compareVersions } from '@abuddy/sdk/utils/pure';",
    "import type { StepDefinition } from '@abuddy/sdk/steps';",
    "import type { ActionMeta } from '@abuddy/sdk/build';",
    "export const newer: number = compareVersions('1.0.0', '0.9.0');",
    "export const step: StepDefinition | undefined = undefined;",
    "export type Meta = ActionMeta;",
    // @abuddy/sdk/fe declares the preload bridge on window
    "import '@abuddy/sdk/fe';",
    "export const popout = window.electronAPI?.plugins.popout;",
    // Typed data access and events come only from the factories a pack's facade uses
    "import { defineEars } from '@abuddy/sdk/ears';",
    "import { defineEvents } from '@abuddy/sdk/services';",
    "import type { EARS } from '@abuddy/sdk';",
    "type IsAny<T> = 0 extends 1 & T ? true : false;",
    "interface MemoEntity { entityType: 'Memo'; text: string }",
    "const { findById } = defineEars<{ Memo: MemoEntity }>();",
    "declare const memoId: EARS.EntityId<'Memo'>;",
    "const memo = findById(memoId)!;",
    "export const text: string = memo.text;",
    "export const textNotAny: IsAny<typeof memo.text> = false;",
    "const { emit } = defineEvents<{ memos: { type: 'MEMO_ADDED'; id: string } }>();",
    "export const added = emit('memos', { type: 'MEMO_ADDED', id: 'm1' });",
    "// @ts-expect-error the memos plugin doesn't receive this event",
    "emit('memos', { type: 'MEMO_REMOVED' });",
    "// @ts-expect-error untyped query helpers aren't pack-facing",
    "export { findAll } from '@abuddy/sdk/ears';",
    // Host-only modules live in the private @abuddy/host; the engine's host hook is source-only
    "// @ts-expect-error not published",
    "export * as internals from '@abuddy/sdk/ears/internals';",
    "// @ts-expect-error not published",
    "export * as packs from '@abuddy/sdk/packs';",
  ] });
}

/**
 * A pack calling models: `services.inference` typed with the AI SDK's own types. Compiled with
 * library checks, since `skipLibCheck` would hide an `ai` release that needs a newer TypeScript
 * than the packages' floor (ai 7 needs 5.7: `Uint8Array<ArrayBuffer>`).
 */
function typecheckInference(tsc: TscVersion, moduleResolution: 'node16' | 'bundler') {
  return compileConsumer(consumer!, tsc, moduleResolution, { 'index.ts': [
    "import { isStepCount, Output, tool } from 'ai';",
    "import { z } from 'zod';",
    "import type { HostServices, InferenceService } from '@abuddy/sdk/services';",
    "import type { ModelId } from '@abuddy/sdk/models';",
    "declare const services: HostServices;",
    "const inference: InferenceService = services.inference;",
    "const model: ModelId = 'anthropic:claude-sonnet-4-5';",
    "export const text: Promise<string> = inference.generateText({ model, instructions: 'Be brief', prompt: 'hi' }).then((r) => r.text);",
    "export const count: Promise<number> = inference.generateText({ model, prompt: 'x', output: Output.object({ schema: z.object({ n: z.number() }) }) }).then((r) => r.output.n);",
    "const lookup = tool({ description: 'look up', inputSchema: z.object({ q: z.string() }), execute: async ({ q }) => q.length });",
    "export const looked = inference.generateText({ model, prompt: 'x', tools: { lookup }, stopWhen: isStepCount(2) });",
    "export const streamed = inference.streamText({ model: 'openai:gpt-5', prompt: 'hi' }).then((r) => r.text);",
    // output as data, typed as the Output it stands for
    "const Weather = z.object({ city: z.string(), temperature: z.number() });",
    "export const city: Promise<string> = inference.generateText({ model, prompt: 'x', output: { type: 'object', schema: Weather } }).then((r) => r.output.city);",
    "export const temps: Promise<number[]> = inference.generateText({ model, prompt: 'x', output: { type: 'array', element: Weather } }).then((r) => r.output.map((w) => w.temperature));",
    "export const label: Promise<'bug' | 'feature'> = inference.generateText({ model, prompt: 'x', output: { type: 'choice', options: ['bug', 'feature'] } }).then((r) => r.output);",
    "export const partial = inference.streamText({ model, prompt: 'x', output: { type: 'object', schema: Weather } }).then(async (r) => { for await (const p of r.partialOutputStream) { const c: string | undefined = p.city; void c; } });",
    // an Output from ai types as it does in ai's own generateText
    "export const viaOutput: Promise<number> = inference.generateText({ model, prompt: 'x', output: Output.object({ schema: Weather }) }).then((r) => r.output.temperature);",
    "// @ts-expect-error a choice spec's output is one of its options",
    "export const notLabel: Promise<'question'> = inference.generateText({ model, prompt: 'x', output: { type: 'choice', options: ['bug'] } }).then((r) => r.output);",
    "// @ts-expect-error an object spec needs a schema",
    "void inference.generateText({ model, prompt: 'x', output: { type: 'object' } });",
    "// @ts-expect-error a provider inference doesn't run",
    "void inference.generateText({ model: 'nope:x', prompt: 'hi' });",
    "// @ts-expect-error a model id without its provider",
    "void inference.generateText({ model: 'gpt-5', prompt: 'hi' });",
  ] }, { skipLibCheck: false, types: ['node'] });
}

describe.skipIf(!PACKAGES_BUILT)('published @abuddy/sdk', () => {
  it.each(CONSUMER_MATRIX)('typecheck for consumers using TypeScript $tsc, moduleResolution $moduleResolution', ({ tsc, moduleResolution }) => {
    const result = typecheck(tsc, moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);

  it.each(['node16', 'bundler'] as const)("types inference with the AI SDK's own types at the TypeScript floor (%s), with library checks", (moduleResolution) => {
    const result = typecheckInference('5.7', moduleResolution);
    expect(result.code, result.output).toBe(0);
  }, 120_000);

  it('ships no host-only module', () => {
    const sdk = path.join(consumer!, 'node_modules', '@abuddy', 'sdk');
    // A plain Node process, as a pack's runtime resolves (test workers run with extra conditions)
    const resolveFromConsumer = (specifier: string) => execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`],
      { cwd: consumer!, env: { PATH: process.env.PATH }, stdio: 'pipe' },
    ).toString();
    expect(() => resolveFromConsumer('@abuddy/sdk/ears/internals')).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    expect(() => resolveFromConsumer('@abuddy/sdk/packs')).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    expect(resolveFromConsumer('@abuddy/sdk/ears')).toBe(pathToFileURL(fs.realpathSync(path.join(sdk, 'dist', 'ears', 'index.js'))).href);
    const shipped = fs.readdirSync(path.join(sdk, 'dist'), { recursive: true }).map(String);
    expect(shipped.filter((f) => /^(packs|persistence|backup)\/|^ears\/internals\.|^fe\/(host|pack-store|app-extensions)\.|^build\/(discover|shared-deps)\./.test(f))).toEqual([]);
    expect(fs.readdirSync(sdk).sort()).toEqual(['abuddy.schema.json', 'dist', 'package.json']);
    // Source maps would point at src, which isn't published
    expect(shipped.filter((f) => f.endsWith('.map'))).toEqual([]);
  });

  it.each(['sdk', 'ui'])('publishes the workspace package.json of @abuddy/%s as is', (name) => {
    const published = fs.readFileSync(path.join(consumer!, 'node_modules', '@abuddy', name, 'package.json'));
    const workspace = fs.readFileSync(path.join(REPO_ROOT, 'packages', `abuddy-${name}`, 'package.json'));
    expect(published.equals(workspace)).toBe(true);
  });
});
