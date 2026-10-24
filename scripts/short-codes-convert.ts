#!/usr/bin/env node
/**
 * Moves a copy of a data dir's short codes to the three-letter prefixes, in place:
 *
 *   npx tsx scripts/short-codes-convert.ts <data dir>
 *
 * Run it on a copy, with the app closed. A short code is engine-owned and refused in any other form than its type's
 * `<prefix>-<n>`, so data written with the old prefixes is converted once, explicitly, here — never at boot:
 *
 * - **Codes:** each Thread `T-<n>` becomes `THR-<n>`, each Flow `F-<n>` `FLW-<n>`, and each Prompt `PROMPT-<n>`
 *   `PRM-<n>`, keeping its number. A flow the content compiler named (`F-<name>`, no number) is numbered after the
 *   highest. `ACT` and `DOC` are unchanged.
 * - **Sequences:** the old prefixes' numbering rows go; the engine starts each new prefix after the highest number
 *   its type holds, so no number is handed out twice.
 * - **References:** a stored reference node (an object holding `shortCode` beside `refId` or `refType`) and a
 *   `data-short-code="…"` attribute in stored markup are rewritten to the new code. A code written into plain prose
 *   is not rewritten — `T-12` in a sentence could be anything — and the script counts those it sees so they can be
 *   checked by hand.
 *
 * It prints what it changed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rewriteAttributes } from '@apackdev/ears/lmdb';

/** Each renamed type's old prefix and its new one */
const RENAMES: Readonly<Record<string, { from: string; to: string }>> = {
  Thread: { from: 'T', to: 'THR' },
  Flow: { from: 'F', to: 'FLW' },
  Prompt: { from: 'PROMPT', to: 'PRM' },
};

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

/** The rename's codes, old to new, and the old sequences' ids: one read of the database's short codes */
function plan(dir: string): { codes: Map<string, string>; sequences: string[] } {
  const numbered = new Map<string, Array<{ code: string; n: number }>>();
  const unnumbered = new Map<string, string[]>();
  const sequences: string[] = [];
  const sequence = new RegExp(`^Sequence-(${Object.keys(RENAMES).map(escape).join('|')}):(${Object.values(RENAMES).map(({ from }) => escape(from)).join('|')})$`);
  rewriteAttributes(dir, (kind, id, value) => {
    if (sequence.test(id)) { if (!sequences.includes(id)) sequences.push(id); return undefined; }
    if (kind !== 'shortCode' || typeof value !== 'string') return undefined;
    const rename = RENAMES[typeOf(id)];
    if (!rename) return undefined;
    const match = new RegExp(`^${escape(rename.from)}-([1-9][0-9]*)$`).exec(value);
    const type = typeOf(id);
    if (match) numbered.set(type, [...(numbered.get(type) ?? []), { code: value, n: Number(match[1]) }]);
    else unnumbered.set(type, [...(unnumbered.get(type) ?? []), value]);
    return undefined;
  });
  const codes = new Map<string, string>();
  for (const [type, { to }] of Object.entries(RENAMES)) {
    const kept = numbered.get(type) ?? [];
    for (const { code, n } of kept) codes.set(code, `${to}-${n}`);
    // A code with no number (a compiled flow's name) is numbered after the highest
    let next = kept.reduce((max, { n }) => Math.max(max, n), 0) + 1;
    for (const code of unnumbered.get(type) ?? []) if (!codes.has(code)) codes.set(code, `${to}-${next++}`);
  }
  return { codes, sequences };
}

/** `value` with every reference it holds rewritten, or undefined when it holds none */
function rewriteReferences(value: unknown, codes: ReadonlyMap<string, string>, markup: RegExp | undefined): unknown {
  if (typeof value === 'string') {
    if (!markup) return undefined;
    const next = value.replace(markup, (whole, code: string) => whole.replace(code, codes.get(code)!));
    return next === value ? undefined : next;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const rewritten = rewriteReferences(item, codes, markup);
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
      const isReference = key === 'shortCode' && ('refId' in record || 'refType' in record) && typeof field === 'string' && codes.has(field);
      const rewritten = isReference ? codes.get(field as string) : rewriteReferences(field, codes, markup);
      if (rewritten === undefined) next[key] = field;
      else { next[key] = rewritten; changed = true; }
    }
    return changed ? next : undefined;
  }
  return undefined;
}

export function convertShortCodes(dir: string) {
  const { codes, sequences } = plan(dir);
  const markup = codes.size > 0 ? new RegExp(`data-short-code="(${[...codes.keys()].map(escape).join('|')})"`, 'g') : undefined;
  // Old codes still named in prose (a string field) after the rewrite, counted rather than guessed at
  const prose = new RegExp(`\\b(${Object.values(RENAMES).map(({ from }) => escape(from)).join('|')})-[0-9]+\\b`, 'g');
  let proseMentions = 0;
  const written = rewriteAttributes(dir, (kind, id, value) => {
    if (kind === 'shortCode') {
      const rename = RENAMES[typeOf(id)];
      return rename && typeof value === 'string' && codes.has(value) ? codes.get(value) : undefined;
    }
    const next = rewriteReferences(value, codes, markup);
    const after = next ?? value;
    if (typeof after === 'string') proseMentions += after.match(prose)?.length ?? 0;
    return next;
  }, { removeEntities: sequences });
  return {
    codes: codes.size,
    sequencesRemoved: written.removedEntities,
    attributesRewritten: written.rewritten,
    proseMentionsLeft: proseMentions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('usage: npx tsx scripts/short-codes-convert.ts <data dir>   (a copy, with the app closed: it converts in place)');
    process.exit(2);
  }
  const dir = database(path.resolve(dataDir));
  console.log(dir, JSON.stringify(convertShortCodes(dir), null, 2));
}
