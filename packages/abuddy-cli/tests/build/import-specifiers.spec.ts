import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAppImportsInPackTests, findHostImports, findJsSpecifiers, findPackBackendConsole, findRawPackHelpers, findRawTransport } from '../../../../scripts/check-import-specifiers.ts';
import { REPO_ROOT } from '../helpers/published-packages';

/** scripts/check-import-specifiers.ts: relative imports in sdk, host and ui name TypeScript sources */
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-specifiers-'));
  for (const [file, content] of Object.entries({
    'query.ts': 'export const q = 1;',
    'view.tsx': 'export const v = 1;',
    'module.mts': 'export const m = 1;',
    'common.cts': 'export const c = 1;',
    'declared.d.ts': 'export declare const d: number;',
  })) write(file, content);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, 'src', file)), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', file), content);
}

function problems(file: string, content: string): string[] {
  write(file, content);
  return findJsSpecifiers(['src'], root);
}

describe('findJsSpecifiers', () => {
  it.each([
    ['import', "import { q } from './query.js';"],
    ['side-effect import', "import './query.js';"],
    ['re-export', "export * from './query.js';"],
    ['dynamic import', "export const load = () => import('./query.js');"],
    ['import type', "export type Q = typeof import('./query.js');"],
    ['import-equals', "import q = require('./query.js');"],
    ['require', "const q = require('./query.js');"],
    ['require.resolve', "const q = require.resolve('./query.js');"],
    ['vi.mock', "vi.mock('./query.js', () => ({}));"],
    ['vi.importActual', "await vi.importActual('./query.js');"],
    ['a .tsx target', "import { v } from './view.js';"],
    ['a .mts target', "import { m } from './module.mjs';"],
    ['a .cts target', "import { c } from './common.cjs';"],
  ])('flags: %s', (_form, code) => {
    expect(problems('consumer.ts', code)).toEqual([expect.stringMatching(/^src\/consumer\.ts:1: \.\//)]);
  });

  it.each(['consumer.tsx', 'consumer.mts', 'consumer.cts'])('checks %s files', (file) => {
    expect(problems(file, "import { q } from './query.js';")).toHaveLength(1);
  });

  it('checks .vue script blocks with their line numbers', () => {
    expect(problems('Widget.vue', "<template><div /></template>\n<script setup lang=\"ts\">\nimport { q } from './query.js';\n</script>\n"))
      .toEqual(['src/Widget.vue:3: ./query.js']);
  });

  it('allows .ts specifiers, declaration-only modules and packages', () => {
    expect(problems('consumer.ts', [
      "import { q } from './query.ts';",
      "import type { d } from './declared.js';",
      "import { x } from 'some-package/x.js';",
      "vi.mock('./missing.js');",
    ].join('\n'))).toEqual([]);
  });

  it('runs as a script through a symlinked path', () => {
    const link = path.join(root, 'check.ts');
    fs.symlinkSync(path.join(REPO_ROOT, 'scripts', 'check-import-specifiers.ts'), link);
    const output = execFileSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [link], { cwd: REPO_ROOT, stdio: 'pipe' }).toString();
    expect(output).toMatch(/Relative import specifiers name \.ts sources/);
  });
});

describe('findRawPackHelpers', () => {
  it.each([
    ["import { emit } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import { emit as emitToPlugin } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import { sendToSystem, onIncoming } from '@abuddy/sdk/events';", 'sendToSystem from @abuddy/sdk/events'],
    ["import { sendToPlugin, services } from '@abuddy/sdk/services';", 'sendToPlugin from @abuddy/sdk/services'],
    ["import { registerRepository, tx } from '@abuddy/sdk/ears';", 'registerRepository from @abuddy/sdk/ears'],
    // A CLI template writes this as pack source
    ["const SYSTEM = `import { emit } from '@abuddy/sdk/helpers';`;", 'emit from @abuddy/sdk/helpers'],
    ["import onConnected, { emit } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import type Events, { sendToPlugin } from '@abuddy/sdk/events';", 'sendToPlugin from @abuddy/sdk/events'],
    ["import{emit}from'@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["export { emit } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["export type { sendToSystem } from '@abuddy/sdk/events';", 'sendToSystem from @abuddy/sdk/events'],
    ["import * as events from '@abuddy/sdk/events';", '* from @abuddy/sdk/events (import the names)'],
    ["export * from '@abuddy/sdk/events';", '* from @abuddy/sdk/events (import the names)'],
    ["const events = await import('@abuddy/sdk/events');", '* from @abuddy/sdk/events (import the names)'],
    ["const { emit } = await import('@abuddy/sdk/events');", 'emit from @abuddy/sdk/events'],
    ["const { onIncoming, emit = noop } = (await import('@abuddy/sdk/events'));", 'emit from @abuddy/sdk/events'],
    ["const { sendToPlugin: send } = require('@abuddy/sdk/events');", 'sendToPlugin from @abuddy/sdk/events'],
    ["const send = (await import('@abuddy/sdk/events')).sendToSystem;", 'sendToSystem from @abuddy/sdk/events'],
    ["require('@abuddy/sdk/ears').registerRepository(repo);", 'registerRepository from @abuddy/sdk/ears'],
    ["/* setup */ import { emit } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import {\n  // typed later\n  emit,\n} from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('flags template text that looks like a comment, with its line', () => {
    write('pack/feature.ts', "const SYSTEM = `/**\n * import { emit } from '@abuddy/sdk/events';\n */`;\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual(['src/pack/feature.ts:2: emit from @abuddy/sdk/events']);
  });

  it('checks .vue script blocks only, with their line numbers', () => {
    write('pack/Widget.vue', [
      "<template><pre>import { emit } from '@abuddy/sdk/events'</pre></template>",
      '<script setup lang="ts">',
      "import { onIncoming } from '@abuddy/sdk/events';",
      "import { sendToPlugin } from '@abuddy/sdk/events';",
      '</script>',
    ].join('\n'));
    expect(findRawPackHelpers(['src/pack'], root)).toEqual(['src/pack/Widget.vue:4: sendToPlugin from @abuddy/sdk/events']);
  });

  it('skips comments', () => {
    write('pack/feature.ts', [
      "// import { emit } from '@abuddy/sdk/events';",
      '/*',
      "  import { emit } from '@abuddy/sdk/events';",
      '*/',
      "const ok = 1; // const { emit } = await import('@abuddy/sdk/events');",
    ].join('\n'));
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([]);
  });

  it('allows the generated facades, other helpers and generated files', () => {
    write('pack/feature.ts', [
      "import { emit, sendToSystem } from '#generated/events';",
      "import { sendToPlugin } from '@/__generated__/events';",
      "import { sendToBrainSystem, onIncoming } from '@abuddy/sdk/events';",
      "import { emit as emitEvent } from 'xstate';",
      "import { getActor } from '@abuddy/sdk/helpers';",
      "import { tx } from '@abuddy/sdk/ears';",
      "import * as ears from '@abuddy/sdk/ears';",
      "const { onConnected } = await import('@abuddy/sdk/events');",
      "const ears2 = await import('@abuddy/sdk/ears');",
      "const onIn = require('@abuddy/sdk/events').onIncoming;",
    ].join('\n'));
    write('pack/__generated__/repositories.ts', "import { registerRepository } from '@abuddy/sdk/ears';\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([]);
  });
});

describe('findRawTransport', () => {
  it.each([
    ["import { trpc } from '@abuddy/sdk/rpc';", '@abuddy/sdk/rpc'],
    ["import type { RootEvents } from '@abuddy/sdk/rpc';", '@abuddy/sdk/rpc'],
    ["const rpc = await import('@abuddy/sdk/rpc');", '@abuddy/sdk/rpc'],
    ['rootEvents.emitOutgoing(wrapped.event);', 'rootEvents'],
    ["trpc.bus.send.mutate({ systemId: 'notes', type: 'GET_NOTES' });", 'trpc.bus'],
    ['await trpc .bus.send.mutate(event);', 'trpc.bus'],
    // A CLI template writes this as pack source
    ["const STATE = `import { rootEvents } from '@abuddy/sdk/x';`;", 'rootEvents'],
    ["import { trpc } from '@abuddy/sdk/rpc/client';", '@abuddy/sdk/rpc/client'],
    ['trpc?.bus.send.mutate(event);', 'trpc.bus'],
    ['trpc!.bus.send.mutate(event);', 'trpc.bus'],
    ["trpc['bus'].send.mutate(event);", 'trpc.bus'],
    ['trpc?.["bus"].send.mutate(event);', 'trpc.bus'],
    ['const { bus } = trpc;', 'trpc.bus'],
    ['const { notes, bus: busRouter } = trpc;', 'trpc.bus'],
    ['/* legacy */ rootEvents.emitOutgoing(event);', 'rootEvents'],
    // `/*` inside a string or regular expression starts no comment
    ["const glob = 'src/*'; rootEvents.emitOutgoing(event);", 'rootEvents'],
    ['const re = /[/*]/; rootEvents.emitOutgoing(event);', 'rootEvents'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawTransport(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('flags template text that looks like a comment, with its line', () => {
    write('pack/feature.ts', 'const PROMPT = `\n * rootEvents.emitOutgoing(event)\n`;\n');
    expect(findRawTransport(['src/pack'], root)).toEqual(['src/pack/feature.ts:2: rootEvents']);
  });

  it('checks .vue script blocks only, with their line numbers', () => {
    write('pack/Widget.vue', '<template><p>rootEvents</p></template>\n<script setup lang="ts">\nconst x = 1;\ntrpc.bus.send.mutate(x);\n</script>\n');
    expect(findRawTransport(['src/pack'], root)).toEqual(['src/pack/Widget.vue:4: trpc.bus']);
  });

  it('skips comments and allows the typed sends', () => {
    write('pack/feature.ts', [
      '// trpc.bus.send.mutate({ systemId: id })',
      '/* rootEvents.onLog(handler) */',
      '/*',
      '  rootEvents is gone',
      '  trpc.bus too',
      ' */',
      "sendToSystem('notes', { type: 'GET_NOTES' }); // was rootEvents",
      "const glob = 'src/*'; // trpc.bus",
      'const { busId } = trpc;',
      'const { notes } = trpc;',
      'trpc.buses.list();',
      "import { x } from '@abuddy/sdk/rpcx';",
      "import { sendToSystem } from '#generated/events';",
      "import { onConnected } from '@abuddy/sdk/events';",
      "sendToSystem('notes', { type: 'GET_NOTES' });",
    ].join('\n'));
    expect(findRawTransport(['src/pack'], root)).toEqual([]);
  });

  it('checks generated files', () => {
    write('pack/__generated__/events.ts', "import { rootEvents } from '@abuddy/sdk/runtime';\n");
    expect(findRawTransport(['src/pack'], root)).toEqual(['src/pack/__generated__/events.ts:1: rootEvents']);
  });
});

describe('findPackBackendConsole', () => {
  it.each([
    ['features/notes/be/system.ts', "console.log('saved');"],
    ['features/code/be/services/git.ts', 'console . error(err);'],
    ['extensions/services/filesystem.ts', "console.warn('missing');"],
    ['extensions/steps/llm/runtime.ts', "console.debug('prompt');"],
    ['features/hooks.ts', "console.log('init');"],
    ['migrations/0.4.0.ts', "console.log('migrated');"],
    ['extensions/steps/action/sandbox.ts', "console.info('ran');"],
    ['extensions/steps/build.ts', "console.log('built');"],
    ['extensions/artifacts/register.ts', "console.log('registered');"],
  ])('flags a console call in %s', (file, code) => {
    write(`pack/${file}`, code);
    const method = code.match(/console\s*\.\s*(\w+)/)![1];
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([`src/pack/${file}:1: console.${method}`]);
  });

  it.each([
    ["console?.warn('missing');", 'console.warn'],
    ["console['error'](err);", 'console.error'],
    ['const { log } = console;', 'console.log'],
    ["globalThis.console.info('x');", 'console.info'],
    ["/* debug */ console.log('x');", 'console.log'],
    ["const text = `${console.log('x')}`;", 'console.log'],
  ])('flags %s', (code, problem) => {
    write('pack/features/notes/be/system.ts', code);
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([`src/pack/features/notes/be/system.ts:1: ${problem}`]);
  });

  it('skips comments and text in strings and templates', () => {
    write('pack/features/notes/be/system.ts', [
      '/*',
      "  console.log('old')",
      '*/',
      "const url = 'https://console.anthropic.com/settings/keys';",
      'const prompt = `',
      ' * console.log(ev.type)',
      '`;',
      "logger.info('saved'); // console.log('saved')",
    ].join('\n'));
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });

  it('matches paths from the pack src root, skipping frontend code and tests', () => {
    for (const file of [
      'extensions/blocks/display/tool-activity-label.ts',
      'extensions/artifacts/viewers/format.ts',
      'extensions/register-fe.ts',
      'extensions/Welcome.vue',
      'features/notes/be/system.spec.ts',
      'features/notes/be/__tests__/helpers.ts',
      'lib/features/notes/be/system.ts',
      'seeds/actions/run.ts',
    ]) write(`pack/${file}`, "console.log('x');");
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });

  it("skips the CLI's template sources and rejects other file roots", () => {
    const init = path.join(root, 'packages/abuddy-cli/src/commands/init.ts');
    fs.mkdirSync(path.dirname(init), { recursive: true });
    fs.writeFileSync(init, "console.log('Created pack');");
    expect(findPackBackendConsole(['packages/abuddy-cli/src/commands/init.ts'], root)).toEqual([]);
    write('pack/features/hooks.ts', "console.log('x');");
    expect(() => findPackBackendConsole(['src/pack/features/hooks.ts'], root)).toThrow(/src directory/);
  });

  it('skips frontend code, commented-out lines and other files', () => {
    write('pack/features/notes/fe/state.ts', "console.log('frontend');");
    write('pack/extensions/steps/llm/fe.ts', "console.log('frontend');");
    write('pack/extensions/tiptap/index.ts', "console.log('frontend');");
    write('pack/extensions/blocks/input/Picker.vue', "<script setup lang=\"ts\">console.log('frontend')</script>");
    write('pack/features/notes/be/system.ts', "// console.log('off')\n/**\n * console.log(ev.type)\n */\nlogger.info('saved');");
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });
});

describe('findHostImports', () => {
  it.each([
    ["import { edgeStore } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import type { PackRegistration } from '@abuddy/host/packs';", '@abuddy/host/packs'],
    ["export { clearMemory } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["const backup = await import('@abuddy/host/backup');", '@abuddy/host/backup'],
    ["const { envs } = require('@abuddy/host/ears');", '@abuddy/host/ears'],
    ["import '@abuddy/host';", '@abuddy/host'],
    // A CLI template writes this as pack source
    ["const REPO = `import { edgeStore } from '@abuddy/host/ears';`;", '@abuddy/host/ears'],
  ])('flags %s', (code, specifier) => {
    write('pack/feature.ts', code);
    expect(findHostImports(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${specifier}`]);
  });

  it('checks generated files and allows the SDK', () => {
    write('pack/feature.ts', "import { findRelations, untypedQx } from '@abuddy/sdk/ears';\nimport { services } from '#generated/services';\n");
    write('pack/__generated__/ears.ts', "import { qx } from '@abuddy/host/ears';\n");
    expect(findHostImports(['src/pack'], root)).toEqual(['src/pack/__generated__/ears.ts:1: @abuddy/host/ears']);
  });
});

describe('findAppImportsInPackTests', () => {
  it.each([
    ["import { clearMemory } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import '@/setup/sdk-host-init';", '@/setup/sdk-host-init'],
    ["import { rootEvents } from '@/core/router/bus-emitter';", '@/core/router/bus-emitter'],
    ["const { init } = await import('../../../abuddy-cli/src/commands/init');", '../../../abuddy-cli/src/commands/init'],
    ["import { installPackFromLocal } from '../../../abuddy-host/src/packs/pack-installer';", '../../../abuddy-host/src/packs/pack-installer'],
  ])('flags %s', (code, specifier) => {
    write('pack-tests/unit/feature.spec.ts', code);
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([`src/pack-tests/unit/feature.spec.ts:1: ${specifier}`]);
  });

  it('allows the SDK, the harness and the pack itself', () => {
    write('pack-tests/unit/feature.spec.ts', [
      "import { untypedQx } from '@abuddy/sdk/ears';",
      "import { startApp } from '@abuddy/testing/harness';",
      "import { repository } from '@/__generated__/repository';",
      "import { handler } from '../../src/extensions/steps/llm/runtime';",
    ].join('\n'));
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([]);
  });
});
