import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { population } from '@apackdev/sdk/testing';
import { repoFiles } from './_support/repo-files.ts';

/**
 * A feature's frontend half is a **surface** and its backend half a **system**. `plugin` names an
 * editor plugin (tiptap/ProseMirror), a bundler plugin (Vite, rollup, PostCSS, esbuild) or a plugin of
 * a third-party CLI this app drives, and nothing else. This guard keeps those vocabularies apart from
 * the concept now that they live side by side.
 *
 * Here and not in `@apackdev/host`, because its subject is every tracked file and not one package. A
 * suite's project is re-run when that project's inputs move, so a guard over the repo has to sit in a
 * suite that declares the repo (`SUITE_READS`' `repo`); in a package suite it would miss a name
 * committed anywhere else, which is how `identity-guard` passed two chain runs over a violation in
 * `@apackdev/cli`.
 *
 * **The patterns are the whole of the rule, and `KEPT` is what makes them trustworthy.** A pattern
 * written to catch `Plugin` is one character away from catching `TiptapPlugin`, which is published API
 * — so every group is asserted to match the names it retires *and* to leave every kept spelling alone.
 * Those two cases are live from the moment this lands; the scan over the tree is what waits.
 */

/** The concept's retired spellings, by group. A group's pattern is built from its own names. */
const RETIRED = {
  'concept-type': [
    'Plugin', 'PluginDefinition', 'PluginDeclaration', 'PluginScope', 'PluginPane', 'PluginRouter',
    'PluginInbox', 'PluginInboxOf', 'PublicPluginInboxOf', 'PluginStateOf', 'PluginEvent', 'PluginEvents',
    'PluginHotkeyDefinition', 'PackPluginEntry', 'PackPluginEvents', 'PackPluginState', 'PackFeaturePlugin',
    'HostPluginEvents', 'OwnPluginEvents', 'QualifiedPluginEvents', 'TypedSendToPlugin',
    'PluginFrontendBinding', 'PluginCatalogEntry', 'ShellPluginCatalog', 'SendablePluginEvents',
    'PluginName', 'OwnPluginName', 'DependencyPluginName',
  ],
  'concept-call': [
    'usePlugin', 'pluginIsRunning', 'usePluginState', 'readPluginState', 'writePluginState',
    'useUntypedPluginState', 'readUntypedPluginState', 'openPlugin', 'untypedOpenPlugin',
    'sendToPlugin', 'broadcastToPlugin', 'untypedBroadcastToPlugin', '_sendToLocalPlugin',
    'sendToPluginActor', 'notifyPluginActor', 'getRegisteredPlugins', 'getPluginEventValidationMap',
    '_pluginTargets',
  ],
  'concept-field': [
    'pluginId', 'pluginIds', 'pluginVisibility', 'lastActivePlugin', 'activePlugin',
    'pluginBindings', 'pluginDefaults',
  ],
  'concept-event': [
    'OPEN_PLUGIN', 'SEND_TO_PLUGIN', 'SELECT_PLUGIN', 'SELECT_PLUGIN_BY_SHELL', 'SET_PLUGIN_VISIBILITY',
    'PLUGIN_VISIBILITY_UPDATED', 'PLUGIN_ACTIVATED', 'PLUGIN_DEACTIVATED', 'PLUGIN_PICKED',
    'PLUGIN_DECLARATIONS_CHANGED', 'PACK_PLUGINS_UNLOADED', 'REQUEST_PLUGIN_DATA', 'RECEIVE_PLUGIN_DATA',
    'DELIVER_PLUGIN_EVENTS', 'SET_LAST_ACTIVE_PLUGIN', 'TRAIL_NEW_PLUGIN', 'SWITCH_PLUGIN_UP',
    'SWITCH_PLUGIN_DOWN', 'OPEN_PLUGIN_FROM_APP', 'APP_OPEN_PLUGIN_HELP', 'APP_POPOUT_PLUGIN',
    'PLUGIN_EVENT_TYPES', 'HOST_PLUGIN_EVENT_TYPES', 'APPLICATION_PLUGIN_EVENT_TYPES',
    'PACKS_PLUGIN_EVENT_TYPES', 'SETTINGS_PLUGIN_EVENT_TYPES', '__PLUGIN_ID__',
  ],
} as const;

type Group = keyof typeof RETIRED;

/**
 * `(?<!\.)` on the word boundary is what keeps `esbuild.Plugin` and `import('esbuild').Plugin` out of
 * `concept-type`: bundler surfaces reach their type through the namespace, and the concept never does.
 */
const patternFor = (group: Group): RegExp => new RegExp(`(?<![.\\w])(${RETIRED[group].join('|')})\\b`);

/** The manifest key, which is not an identifier and so needs its own pattern. */
const MANIFEST_KEY = /"plugin":/;

/**
 * One spelling from each vocabulary that keeps the word, which no pattern above may match.
 *
 * This is the case with teeth. Every entry is either published API (`TiptapPlugin`,
 * `tiptapPluginRegistry`, `searchPluginKey`) or a key in the user's window storage
 * (`code-plugin-open-tabs`), so a pattern that grew greedy enough to reach one of them would have the
 * rename break a pack author's editor extension or orphan a user's open tabs.
 */
const KEPT = [
  'tiptapPlugins', 'TiptapPlugin', 'TiptapPluginBinding', 'TiptapPluginDeclaration', 'tiptapPluginRegistry',
  'PluginKey', 'searchPlugin', 'searchPluginKey', 'SearchPluginState', 'commandSuggestionPluginKey',
  'addProseMirrorPlugins', 'ref.editor.registerPlugin(imagePastePlugin)',
  'VitePlugin', 'esbuild.Plugin', "import('esbuild').Plugin", 'surfaces: [vue()]', 'surfaces.push(x)',
  'packExternalsPlugin', 'hostSharedModulesPlugin', 'postcssPlugins', 'pluginVue', 'pluginOxlint',
  "'@vitejs/plugin-vue'", "'eslint-plugin-vue'", "'rollup-plugin-dts'", "name: 'collect-bare-imports'",
  "'code-plugin-open-tabs'", "'apack-last-active-plugin'",
  // `claude plugin` — the CLI's own plugin system, which the code feature wraps, and the most dangerous
  // of the four: its names reach a **subprocess argv**, where a rename typechecks and then calls a
  // subcommand that does not exist. A pass over this repo did exactly that, turning
  // `run(['plugin', 'install', …])` into `run(['surface', 'install', …])` — nothing in the compiler or
  // any spec could see it, because the string is only ever handed to another program.
  'PluginInfo', 'pluginDir', "'--plugin-dir'",
  "['plugin', 'list', '--json']", "run(['plugin', 'install', plugin, ...scopeArg(opts.scope)], opts)",
  "['plugin', 'marketplace', 'add', source, ...scopeArg(opts.scope)]", 'claude plugin',
] as const;

/**
 * The files a retired spelling may still appear in, per group — never per file, so an entry earned for
 * one group does not hide another arriving later.
 */
const ALLOWED: Record<string, { groups: readonly Group[]; why: string }> = {
  'packages/repo-checks/tests/surface-vocabulary.spec.ts': {
    groups: ['concept-type', 'concept-call', 'concept-field', 'concept-event'],
    why: 'this guard, which has to spell the names it retires',
  },
};

const trackedCodeFiles = (): string[] => repoFiles().filter((file) =>
  /\.(ts|tsx|js|mjs|cjs|vue|json|sh)$/.test(file)
  && !file.includes('node_modules/') && !file.includes('/dist/') && !file.includes('__generated__/')
  && !file.includes('/__golden__/'));

/** Which groups a file actually holds, for the staleness case. */
function fires(file: string): Group[] {
  const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
  return (Object.keys(RETIRED) as Group[]).filter((group) => patternFor(group).test(text));
}

describe('the patterns themselves', () => {
  it('each group matches every name it retires', () => {
    for (const group of Object.keys(RETIRED) as Group[]) {
      const pattern = patternFor(group);
      for (const name of population(`${group}'s names`, RETIRED[group])) {
        expect(pattern.test(`const x = ${name};`), `${group} no longer matches ${name}`).toBe(true);
      }
    }
    expect(MANIFEST_KEY.test('"plugin": { "label": "Notes" }')).toBe(true);
  });

  it('leaves every spelling that keeps the word alone', () => {
    const groups = Object.keys(RETIRED) as Group[];
    const caught = population('kept spellings', KEPT).flatMap((sample) => groups
      .filter((group) => patternFor(group).test(sample))
      .map((group) => `${group} matches ${sample}`));
    expect(caught, 'narrow the pattern; these are editor surfaces, bundler surfaces or stored keys').toEqual([]);
  });

  it('matches a name only on its own word, not inside a longer one', () => {
    expect(patternFor('concept-type').test('const x = SurfacePluginThing;')).toBe(false);
    expect(patternFor('concept-call').test('const x = mySendToPlugin;')).toBe(false);
  });
});

describe('the surface vocabulary', () => {
  /**
   * Parked until Phase 5 of `docs/goals/goal-surfaces-to-surfaces.md`: the tree still spells the concept
   * `plugin` everywhere, so this case cannot pass until the rename lands. `it.fails` makes that a
   * tripwire rather than a silence — the moment the rename is complete this starts failing, and Phase 5
   * is to flip it to `it`.
   */
  it.fails('no code names the frontend actor a plugin', () => {
    const files = population('tracked code files', trackedCodeFiles(), { atLeast: 500 });
    const violations: string[] = [];
    for (const file of files) {
      const excused = ALLOWED[file]?.groups ?? [];
      const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        for (const group of Object.keys(RETIRED) as Group[]) {
          if (excused.includes(group)) continue;
          if (patternFor(group).test(line)) violations.push(`${file}:${i + 1} ${line.trim()}  ← ${group}`);
        }
        if (file.endsWith('apack.json') && MANIFEST_KEY.test(line)) {
          violations.push(`${file}:${i + 1} ${line.trim()}  ← the manifest key is features[].surface`);
        }
      });
    }
    expect(violations, 'a surface is not a plugin; see docs/goals/goal-surfaces-to-surfaces.md').toEqual([]);
  });

  it('excuses nothing that has stopped needing it', () => {
    const stale = Object.entries(ALLOWED).flatMap(([file, { groups }]) => {
      if (!fs.existsSync(path.join(REPO_ROOT, file))) return [`${file}: gone`];
      const actual = fires(file);
      const unused = groups.filter((group) => !actual.includes(group));
      return unused.length > 0 ? [`${file}: no longer holds ${unused.join(', ')}`] : [];
    });
    expect(stale, 'drop these from ALLOWED, or the group they name from their entry').toEqual([]);
  });
});
