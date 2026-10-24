#!/usr/bin/env node
/**
 * Brings a copy of a data dir's short codes to the rule the engine holds them to, in place:
 *
 *   node scripts/with-source.mjs npx tsx scripts/short-codes-convert.ts <data dir>
 *
 * Run it on a copy, with the app closed. A short code is engine-owned: a numbered type's rows hold `<prefix>-<n>` with
 * the prefix its manifest declares, and every other type's rows hold none — `create` refuses anything else, so a backup
 * holding another form fails to import. Data written before that holds codes under prefixes nobody declares now (`T-`,
 * `F-<name>`, `PROMPT-`, and the first three letters of any type, `PRO-` and `NOT-`, which the engine once defaulted
 * to). This converts it once, explicitly, here — never at boot:
 *
 * - **Codes of a numbered type** (the SDK's `SDK_SHORT_CODES` and default-setup's manifest): a code already in the
 *   type's form stays. Any other `<X>-<n>` becomes `<prefix>-<n>`, keeping its number unless a row of the type already
 *   holds it; what is left — a taken number, or a code with none, such as a compiled flow's `F-<name>` — is numbered
 *   after the highest.
 * - **Codes of a type that isn't numbered** are removed.
 * - **Sequences:** every short code numbering row goes. The engine starts a prefix's sequence after the highest number
 *   its type holds, so none is handed out twice, whatever the data held before.
 * - **References:** a stored reference node (an object holding `shortCode` beside `refId` or `refType`) and a
 *   `data-short-code="…"` attribute in stored markup are rewritten to the new code. A code written into plain prose is
 *   not rewritten — `T-12` in a sentence could be anything — and the script counts those it sees so they can be
 *   checked by hand.
 *
 * It prints what it changed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REMOVE_ATTRIBUTE, rewriteAttributes } from '@apackdev/ears/lmdb';
import { _packShortCodes } from '@apackdev/sdk/framework';
import { SDK_SHORT_CODES } from '@apackdev/sdk/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Each numbered entity type's prefix: the SDK's and the shipped pack's, as declared now */
export function declaredPrefixes(): Record<string, string> {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/default-setup/apack.json'), 'utf8'));
  return { ...SDK_SHORT_CODES, ..._packShortCodes(manifest) };
}

/** The data dir's database directory, in the app's layout or directly */
function database(dataDir: string): string {
  for (const base of [path.join(dataDir, 'apack'), dataDir]) {
    const dir = path.join(base, 'ears-db');
    if (fs.existsSync(path.join(dir, 'data.mdb'))) return dir;
  }
  throw new Error(`No ears-db database under ${dataDir}`);
}

const typeOf = (id: string) => id.slice(0, id.indexOf('-'));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A short code numbering row; a label's numbering row is `Sequence-label:…` and stays */
const isShortCodeSequence = (id: string) => id.startsWith('Sequence-') && !id.startsWith('Sequence-label:');

/** Per type, what the conversion did to its codes */
interface TypeSummary { kept: number; renamed: number; renumbered: number; removed: number }

/** Each entity's new code (or removal), the codes references may be rewritten by, and the sequences to remove */
function plan(dir: string, prefixes: Readonly<Record<string, string>>) {
  const held = new Map<string, Array<{ id: string; code: string }>>();
  const sequences = new Set<string>();
  rewriteAttributes(dir, (kind, id, value) => {
    if (isShortCodeSequence(id)) sequences.add(id);
    else if (kind === 'shortCode' && typeof value === 'string') {
      const type = typeOf(id);
      held.set(type, [...(held.get(type) ?? []), { id, code: value }]);
    }
    return undefined;
  });

  const byId = new Map<string, string | typeof REMOVE_ATTRIBUTE>();
  const summary: Record<string, TypeSummary> = {};
  const renumbered: Array<{ id: string; from: string; to: string }> = [];
  const oldCodeHolders = new Map<string, number>();
  for (const [type, rows] of held) {
    const counts: TypeSummary = (summary[type] = { kept: 0, renamed: 0, renumbered: 0, removed: 0 });
    const prefix = prefixes[type];
    if (!prefix) {
      for (const { id } of rows) { byId.set(id, REMOVE_ATTRIBUTE); counts.removed++; }
      continue;
    }
    const own = new RegExp(`^${escape(prefix)}-([1-9][0-9]*)$`);
    const taken = new Set<number>();
    const rest: typeof rows = [];
    for (const row of rows) {
      const match = own.exec(row.code);
      if (match && !taken.has(Number(match[1]))) { taken.add(Number(match[1])); counts.kept++; }
      else rest.push(row);
    }
    // Lowest number first, so a number two old prefixes share goes to one of them and not to neither
    const numberOf = (code: string) => { const match = /^[A-Z]+-([1-9][0-9]*)$/.exec(code); return match ? Number(match[1]) : undefined; };
    rest.sort((a, b) => (numberOf(a.code) ?? Infinity) - (numberOf(b.code) ?? Infinity));
    const leftover: typeof rows = [];
    for (const row of rest) {
      const n = numberOf(row.code);
      if (n === undefined || taken.has(n)) { leftover.push(row); continue; }
      taken.add(n);
      byId.set(row.id, `${prefix}-${n}`);
      counts.renamed++;
    }
    let next = Math.max(0, ...taken) + 1;
    for (const row of leftover) {
      const to = `${prefix}-${next++}`;
      byId.set(row.id, to);
      renumbered.push({ id: row.id, from: row.code, to });
      counts.renumbered++;
    }
    for (const { code } of rows) oldCodeHolders.set(code, (oldCodeHolders.get(code) ?? 0) + 1);
  }

  // A reference by code alone is rewritten only when one entity held that code
  const codes = new Map<string, string>();
  for (const [type, rows] of held) {
    if (!prefixes[type]) continue;
    for (const { id, code } of rows) {
      const to = byId.get(id);
      if (typeof to === 'string' && oldCodeHolders.get(code) === 1) codes.set(code, to);
    }
  }
  return { byId, codes, sequences: [...sequences], summary, renumbered };
}

/** `value` with every reference it holds rewritten, or undefined when it holds none */
function rewriteReferences(value: unknown, byId: ReadonlyMap<string, unknown>, codes: ReadonlyMap<string, string>, markup: RegExp | undefined): unknown {
  if (typeof value === 'string') {
    if (!markup) return undefined;
    const next = value.replace(markup, (whole, code: string) => whole.replace(code, codes.get(code)!));
    return next === value ? undefined : next;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const rewritten = rewriteReferences(item, byId, codes, markup);
      if (rewritten === undefined) return item;
      changed = true;
      return rewritten;
    });
    return changed ? next : undefined;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const record = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(record)) {
      let rewritten: unknown;
      if (key === 'shortCode' && ('refId' in record || 'refType' in record) && typeof field === 'string') {
        // The entity it names, when it names one, says which code it now holds; the code alone, when only one held it
        const byRef = typeof record.refId === 'string' ? byId.get(record.refId) : undefined;
        rewritten = typeof byRef === 'string' ? byRef : codes.get(field);
        if (rewritten === field) rewritten = undefined;
      } else rewritten = rewriteReferences(field, byId, codes, markup);
      if (rewritten === undefined) next[key] = field;
      else { next[key] = rewritten; changed = true; }
    }
    return changed ? next : undefined;
  }
  return undefined;
}

/** How many times `pattern` matches in the strings `value` holds, at any depth */
function mentions(value: unknown, pattern: RegExp): number {
  if (typeof value === 'string') return value.match(pattern)?.length ?? 0;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + mentions(item, pattern), 0);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.values(value).reduce((sum: number, field) => sum + mentions(field, pattern), 0);
  return 0;
}

export function convertShortCodes(dir: string, prefixes: Readonly<Record<string, string>> = declaredPrefixes()) {
  const { byId, codes, sequences, summary, renumbered } = plan(dir, prefixes);
  const changed = [...codes].filter(([from, to]) => from !== to).map(([from]) => from);
  const markup = changed.length > 0 ? new RegExp(`data-short-code="(${changed.map(escape).join('|')})"`, 'g') : undefined;
  // Old codes still named in prose after the rewrite, counted rather than guessed at
  const prose = changed.length > 0 ? new RegExp(`\\b(${changed.map(escape).join('|')})\\b`, 'g') : undefined;
  let proseMentions = 0;
  const written = rewriteAttributes(dir, (kind, id, value) => {
    if (kind === 'shortCode') return byId.get(id);
    const next = rewriteReferences(value, byId, codes, markup);
    if (prose) proseMentions += mentions(next ?? value, prose);
    return next;
  }, { removeEntities: sequences });
  return {
    types: summary,
    renumbered,
    sequencesRemoved: written.removedEntities,
    attributesRewritten: written.rewritten,
    attributesRemoved: written.removed,
    proseMentionsLeft: proseMentions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('usage: node scripts/with-source.mjs npx tsx scripts/short-codes-convert.ts <data dir>   (a copy, with the app closed: it converts in place)');
    process.exit(2);
  }
  const dir = database(path.resolve(dataDir));
  console.log(dir, JSON.stringify(convertShortCodes(dir), null, 2));
}
