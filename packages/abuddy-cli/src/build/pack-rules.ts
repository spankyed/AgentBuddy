// What a pack's code may say, as rules any pack is held to — not only the ones in this repo.
//
// Before this, an external pack got two of the nineteen rules that keep this repo's packs honest
// (`docs/goals/goal-one-rule-set.md`): the other seventeen lived in `scripts/check-import-specifiers.ts`,
// which only ever runs here. The rule is the same rule wherever it runs, so it lives once — here, in the
// package that drives a pack's whole toolchain — and the repo's script applies these same functions to the
// packs in this checkout while keeping its own rules about the repo's layout.
//
// **A rule is switchable only when a violation has no runtime effect.** `host-imports` is not: the bundler
// refuses the import anyway, and the message is the point. `backend-console` is: `console.log` logs. The
// switchable ones are named in `abuddy.checks.json`'s `allow` list, which is read at build time and never by
// the app, so `abuddy.json` stays what the app loads.
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { ownModuleFindings, type OwnModuleSpecifier } from '@abuddy/host/build/own-module-specifiers';
import { readSubpathImports } from '@abuddy/host/build/subpath-imports';
import { moduleOf, readSource, sourceFiles, type SourceView } from './pack-sources.ts';
import { packResolvesSource } from './pack-resolution.ts';

/** Where a file sits in the pack, which is all any of these rules needs besides the file itself */
export interface PackPlace {
  /** The pack root */
  readonly packDir: string;
  /** The file, relative to the pack root, `/`-separated */
  readonly relative: string;
  /** Relative to the `src` or `tests` root it was found under — what the backend-path rules read */
  readonly inRoot: string;
  /** A `__generated__` path segment: codegen's output, which some rules exempt */
  readonly generated: boolean;
  /** The pack's `package.json` `imports`, read once */
  readonly imports: Record<string, string>;
}

export type PackRuleKey =
  | 'source-resolution'
  | 'own-modules' | 'pack-own-aliases' | 'internal-package-imports'
  | 'host-imports' | 'lmdb-imports'
  | 'untyped-sends' | 'raw-transport' | 'backend-console';

/**
 * One finding, with the span of the code it is about.
 *
 * The span is what lets the set report one message per offence. `import { _rootEvents } from '@abuddy/host/bus'`
 * breaks three rules — the package is not installed, the name is `@internal`, and `_rootEvents` is the raw
 * transport — and a pack author who has to delete one line should be told once, by the rule whose cause is the
 * most fundamental. Without spans the only way to tell "three rules, one site" from "three rules, one line"
 * would be the line number, and two real offences do share a line.
 */
export interface PackFinding {
  readonly line: number;
  readonly what: string;
  readonly start: number;
  readonly end: number;
}

export interface PackRule {
  readonly key: PackRuleKey;
  /** The sentence reported when it fires, the same one `check:specifiers` prints */
  readonly rule: string;
  /** Whether a pack may allow it in `abuddy.checks.json`: true only when a violation has no runtime effect */
  readonly switchable: boolean;
  /** Per file, over its parsed source. Most rules are this: an offence is something a file says */
  check?(view: SourceView, at: PackPlace): PackFinding[];
  /**
   * The pack as a whole, for a rule whose subject is not any one file's text — what its compiler resolves, what
   * its manifest wires together. Reported as written, with no span, so it takes no part in the one-offence-one-
   * message dedupe below: there is no site for another rule to be right about.
   */
  checkPack?(packDir: string): string[];
}

/** Ref-taking sends a pack gets as name-taking ones from `#generated/events`, whichever module exports them */
const EVENT_SENDS = ['untypedBroadcastToPlugin', 'untypedSendToSystem', '_sendToLocalPlugin'];

/** A pack's backend: where `createLogger` replaces `console`, by the layout every pack has */
const BACKEND_PATH = /^(features\/[^/]+\/be\/|features\/hooks\.ts$|migrations\/|extensions\/)/;
const FRONTEND_OR_TEST_PATH = /\.vue$|(^|\/)(fe|register-fe)\.ts$|^extensions\/(tiptap|artifacts\/viewers|blocks\/[^/]+)\/|(^|\/)__tests__\/|\.(spec|test)\.ts$/;

/** The names one node imports from an `@abuddy` package, by their imported rather than local name */
function importedFrom(node: ts.Node): { module: string; names: string[] } | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const module = moduleOf(node);
    if (module === undefined) return undefined;
    const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
    if (!bindings || ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) return { module, names: [] };
    return { module, names: bindings.elements.map((el) => (el.propertyName ?? el.name).text) };
  }
  // `const { _x } = await import('@abuddy/…')`
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
    const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
    const module = moduleOf(call);
    if (module === undefined) return undefined;
    return { module, names: node.name.elements.map((el) => (el.propertyName ?? el.name).getText()) };
  }
  return undefined;
}

/**
 * Every pack rule, **in precedence order**: when several are right about one site, the first reports it and the
 * rest stand down (`packRuleProblems`). The order is the order of causes — what stops the pack loading at all,
 * then what stops a specifier resolving, then what breaks on an app update, then the conventions — so an author
 * deleting one import is told the thing that matters about it.
 */
export const PACK_RULES: readonly PackRule[] = [
  {
    key: 'source-resolution',
    switchable: false,
    rule: "A pack compiles against the @abuddy packages' published dist, the one layout a pack author has: "
      + 'its tsconfig must not resolve a checkout\'s source, which its own bundles never do',
    checkPack(packDir) {
      return packResolvesSource(packDir).map(({ specifier, resolved }) =>
        `${specifier} -> ${resolved} (remove the @abuddy/source condition from this pack's tsconfig; esbuild and `
        + 'Vite ignore it, so only the typecheck reads source and it proves nothing about what ships)');
    },
  },
  {
    key: 'host-imports',
    switchable: false,
    rule: "A pack doesn't import the host's private @abuddy/host package, which is not installed for a pack; "
      + 'use @abuddy/sdk',
    check(view, place) {
      return view.specifiers.filter(({ text }) => /^@abuddy\/host(\/|$)/.test(text))
        .map(({ text, line, start, end }) => ({ line, what: text, start, end }));
    },
  },
  {
    key: 'lmdb-imports',
    switchable: false,
    rule: 'A pack reaches its data through the engine the app installs: neither lmdb nor @abuddy/ears/lmdb is '
      + 'provided to a pack, so importing one fails at load',
    check(view, place) {
      return view.specifiers.filter(({ text }) => /^lmdb(\/|$)/.test(text) || /^@abuddy\/ears\/lmdb(\/|$)/.test(text))
        .map(({ text, line, start, end }) => ({ line, what: text, start, end }));
    },
  },
  {
    key: 'own-modules',
    switchable: false,
    rule: 'A pack names its own modules by the file that is there, extension and all: no runtime resolves an '
      + 'extensionless specifier in ESM, so one works only while a build guesses the suffix and this one does not — '
      + 'and the .js a pack would otherwise name is a file it never emits, since it ships one bundle',
    check(view, place) {
      const found: OwnModuleSpecifier[] = view.specifiers.map(({ text, line, start, end }) =>
        ({ file: place.relative, line, specifier: text, start, end }));
      return ownModuleFindings(place.packDir, found).map(({ line, specifier, named, start, end }) =>
        ({ line, what: `'${specifier}' names no file — write '${named}'`, start: start as number, end: end as number }));
    },
  },
  {
    key: 'pack-own-aliases',
    switchable: false,
    rule: 'A pack names its own modules with # subpath imports from its package.json (#generated/x, '
      + '#features/x): a @/ path is a TypeScript-only mapping and no runtime reads it',
    check(view, place) {
      return view.specifiers.filter(({ text }) => text.startsWith('@/')).map(({ text, line, start, end }) => ({ line, what: text, start, end }));
    },
  },
  {
    key: 'internal-package-imports',
    switchable: false,
    rule: "A pack imports only the @abuddy packages' public API: an export named `_x` is @internal, the app's "
      + 'alone, and an app update is free to rename it',
    check(view, place) {
      if (place.generated || !view.code.includes('@abuddy/')) return [];
      return view.visit((node) => {
        const imported = importedFrom(node);
        if (!imported?.module.startsWith('@abuddy/')) return undefined;
        return imported.names.filter((name) => name.startsWith('_')).map((name) => `${name} from ${imported.module}`);
      });
    },
  },
  {
    key: 'untyped-sends',
    switchable: true,
    rule: 'Pack code uses the typed facades: broadcastToPlugin, sendToPlugin and sendToSystem from '
      + '#generated/events, repositories declared in abuddy.json',
    check(view, place) {
      if (place.generated) return [];
      return view.visit((node) => {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return undefined;
        const imported = importedFrom(node);
        if (!imported?.module.startsWith('@abuddy/')) return undefined;
        const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
        if (!bindings || ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) {
          // `import * as x from`, `export * from`, `export * as x from` (a default import has no bindings)
          const namespace = bindings !== undefined || ts.isExportDeclaration(node);
          return namespace && imported.module === '@abuddy/sdk/events'
            ? ['* from @abuddy/sdk/events (import the names)'] : undefined;
        }
        const raw = imported.module === '@abuddy/ears'
          ? [...EVENT_SENDS, 'registerRepository', 'unregisterRepository'] : EVENT_SENDS;
        return imported.names.filter((name) => raw.includes(name)).map((name) => `${name} from ${imported.module}`);
      });
    },
  },
  {
    key: 'raw-transport',
    switchable: true,
    rule: 'Pack code sends with broadcastToPlugin, sendToPlugin and sendToSystem from #generated/events, and '
      + 'subscribes with onConnected and onIncoming from @abuddy/sdk/events',
    check(view, place) {
      return view.visit((node) => {
        const module = moduleOf(node);
        if (module && /^@abuddy\/sdk\/rpc(\/|$)/.test(module)) return [module];
        if (ts.isIdentifier(node) && node.text === '_rootEvents') return ['_rootEvents'];
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'bus'
          && ts.isIdentifier(node.expression) && node.expression.text === 'trpc') return ['trpc.bus'];
        return undefined;
      });
    },
  },
  {
    key: 'backend-console',
    switchable: true,
    rule: 'Pack backend code logs with createLogger from @abuddy/sdk/logger',
    check(view, place) {
      if (!BACKEND_PATH.test(place.inRoot) || FRONTEND_OR_TEST_PATH.test(place.inRoot)) return [];
      return view.visit((node) => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'console') {
          return [`console.${node.name.text}`];
        }
        return undefined;
      });
    },
  },
];

const SWITCHABLE = PACK_RULES.filter((rule) => rule.switchable).map((rule) => rule.key);

/**
 * `abuddy.checks.json`: the rules this pack allows.
 *
 * A file of its own rather than a manifest key, because it is read at build time and never by the app — and
 * an `allow` list rather than a map of booleans, so there is nothing to interpret and no way to write a
 * confusing `true`. A name that is not switchable, or not a rule at all, is an error naming what may be
 * allowed: a silent typo would leave a rule off for as long as nobody looked.
 */
export function loadPackChecks(packDir: string): Set<PackRuleKey> {
  const file = path.join(packDir, 'abuddy.checks.json');
  if (!fs.existsSync(file)) return new Set();
  let allow: unknown;
  try {
    ({ allow } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { allow?: unknown });
  } catch (err) {
    throw new Error(`abuddy.checks.json does not parse: ${(err as Error).message}`);
  }
  if (allow === undefined) return new Set();
  if (!Array.isArray(allow) || allow.some((key) => typeof key !== 'string')) {
    throw new Error('abuddy.checks.json\'s "allow" is a list of rule names, e.g. { "allow": ["backend-console"] }');
  }
  const wrong = (allow as string[]).filter((key) => !SWITCHABLE.includes(key as PackRuleKey));
  if (wrong.length > 0) {
    throw new Error(`abuddy.checks.json allows ${wrong.map((key) => `"${key}"`).join(', ')}, which `
      + `${wrong.length === 1 ? 'is not a rule a pack may switch off' : 'are not rules a pack may switch off'}. `
      + `These are: ${SWITCHABLE.join(', ')}. The rest report something that breaks — a specifier nothing `
      + 'resolves, an import the bundler refuses, a cycle codegen cannot read — so there is nothing to allow.');
  }
  return new Set(allow as PackRuleKey[]);
}

/** Every source file under the pack's `dirs`, with where it sits */
function packFiles(packDir: string, dirs: readonly string[]): { view: SourceView; place: PackPlace }[] {
  const imports = readSubpathImports(packDir);
  const found: { view: SourceView; place: PackPlace }[] = [];
  for (const dir of dirs) {
    const root = path.join(packDir, dir);
    if (!fs.existsSync(root)) continue;
    for (const file of sourceFiles(root)) {
      const relative = path.relative(packDir, file).split(path.sep).join('/');
      found.push({
        view: readSource(file),
        place: {
          packDir,
          relative,
          inRoot: path.relative(root, file).split(path.sep).join('/'),
          generated: relative.split('/').includes('__generated__'),
          imports,
        },
      });
    }
  }
  return found;
}

/**
 * Every rule's findings over the pack, by key, with the rules the pack allows left out.
 *
 * One pass over the files: each is read and parsed once and every rule sees the same view, which is what makes
 * running nine rules cost about what running one used to.
 *
 * **One offence, one message.** Several rules can be right about one line —
 * `import { _rootEvents } from '@abuddy/host/bus'` breaks three — and a pack author deleting one import should
 * be told once, by the rule whose cause comes first: the package is not installed for a pack, so whether the
 * name is `@internal` and whether it is the raw transport are beside the point. So a finding whose span sits
 * inside one an earlier rule already claimed is dropped, and `PACK_RULES`' order *is* that precedence —
 * declared there, with each rule's reason, rather than decided here.
 *
 * Spans, not lines: two real offences do share a line (`import …; console.log(…)`), and both should be
 * reported. `pack-rules.spec.ts` holds the order to what it claims.
 */
export function packRuleProblems(packDir: string, dirs: readonly string[] = ['src']): Map<PackRuleKey, string[]> {
  const allowed = loadPackChecks(packDir);
  const rules = PACK_RULES.filter((rule) => !allowed.has(rule.key));
  const problems = new Map<PackRuleKey, string[]>();
  for (const rule of rules) {
    const found = rule.checkPack?.(packDir) ?? [];
    if (found.length > 0) problems.set(rule.key, [...(problems.get(rule.key) ?? []), ...found]);
  }
  for (const { view, place } of packFiles(packDir, dirs)) {
    const claimed: { start: number; end: number }[] = [];
    for (const rule of rules) {
      const kept = (rule.check?.(view, place) ?? []).filter((finding) => {
        // Overlapping a span an earlier rule claimed, so it is the same offence seen another way. Overlap
        // rather than containment, because the spans nest both ways: `host-imports` reports the specifier and
        // `internal-package-imports` the whole import around it, so a containment test would let whichever
        // rule reported the *wider* span win regardless of the order declared below.
        if (claimed.some(({ start, end }) => finding.start < end && start < finding.end)) return false;
        claimed.push({ start: finding.start, end: finding.end });
        return true;
      });
      if (kept.length > 0) {
        problems.set(rule.key, [...(problems.get(rule.key) ?? []),
          ...kept.map(({ line, what }) => `${place.relative}:${line}: ${what}`)]);
      }
    }
  }
  return problems;
}

/**
 * Throws naming every rule that fired, or returns.
 *
 * Every rule, not the first: a pack author fixes them in one pass rather than in one build each. A switchable
 * rule's block ends with the line that allows it, and a rule that is not switchable does not offer one,
 * because `loadPackChecks` would refuse the key.
 */
export function refusePackRuleViolations(packDir: string, dirs?: readonly string[]): void {
  const problems = packRuleProblems(packDir, dirs);
  if (problems.size === 0) return;
  const blocks = [...problems].map(([key, found]) => {
    const rule = PACK_RULES.find((candidate) => candidate.key === key) as PackRule;
    const lines = [`  ${rule.rule}:`, ...found.map((problem) => `    - ${problem}`)];
    // The whole file, not a key inside one: `abuddy.checks.json` holds `allow` at the top level, and advice
    // that has to be re-nested to work is advice that silently does nothing (`loadPackChecks` reads no `checks`
    // key, so a pasted `"checks": { … }` allows nothing). `allowLineWorks` in the spec pastes it and checks.
    if (rule.switchable) lines.push(`    to allow this, put { "allow": ["${key}"] } in abuddy.checks.json`);
    return lines.join('\n');
  });
  throw new Error(`${problems.size} pack rule${problems.size === 1 ? '' : 's'} failed.\n\n${blocks.join('\n\n')}`);
}
