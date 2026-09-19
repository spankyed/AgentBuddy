// How `abuddy db` prints or writes a result: JSON, CSV or a readable form
import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspect } from 'node:util';
import type { DbIo } from './target';

export const OUTPUT_FORMATS = ['pretty', 'json', 'csv'] as const;
export type OutputFormat = typeof OUTPUT_FORMATS[number];

export function outputFormat(value: unknown): OutputFormat {
  if (value === undefined) return 'pretty';
  if ((OUTPUT_FORMATS as readonly unknown[]).includes(value)) return value as OutputFormat;
  throw new Error(`--output must be one of ${OUTPUT_FORMATS.join(', ')}`);
}

/**
 * JSON, with what JSON has no form for written as text: a date as its ISO string (JSON.stringify's own doing), a
 * bigint as digits, and an object that holds itself as `[Circular]` rather than a thrown error.
 */
function safely(): (key: string, held: unknown) => unknown {
  const seen = new WeakSet<object>();
  return function replace(_key: string, held: unknown) {
    if (typeof held === 'bigint') return held.toString();
    if (held !== null && typeof held === 'object') {
      if (seen.has(held)) return '[Circular]';
      seen.add(held);
    }
    return held;
  };
}

export function toJSON(value: unknown): string {
  return JSON.stringify(value, safely(), 2) ?? 'undefined';
}

/** One value as a cell: a date as its ISO string, an object as JSON, nothing for null and undefined */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  // A cell stays on one line, so an object in it is written compactly
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value, safely()) ?? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows of objects as CSV with a column per key any row has; one object is one row; anything else one cell. An empty
 * result writes nothing at all, rather than a line with no columns in it.
 */
export function toCSV(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0) return '';
  if (!rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row) && !(row instanceof Date))) {
    return rows.map((row) => csvCell(row)).join('\n') + '\n';
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row as object)))];
  const lines = rows.map((row) => columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(','));
  return [columns.map(csvCell).join(','), ...lines].join('\n') + '\n';
}

export function toPretty(value: unknown): string {
  if (typeof value === 'string') return value;
  return inspect(value, { depth: 6, maxArrayLength: 200, colors: false, breakLength: 120 });
}

export function formatResult(value: unknown, format: OutputFormat): string {
  if (format === 'json') return toJSON(value);
  if (format === 'csv') return toCSV(value).trimEnd();
  return toPretty(value);
}

/**
 * Waits for what was printed to reach stdout and stderr. Node takes a write to a pipe into memory and sends it as the
 * reader takes it, and `process.exit` drops whatever is still waiting, so a command that prints a lot and then exits
 * (a failing script, above all) loses its output without this.
 */
export async function flushOutput(): Promise<void> {
  await Promise.all([process.stdout, process.stderr].map((stream) => new Promise<void>((resolve) => {
    if (stream.writableLength === 0 || stream.writableEnded || stream.destroyed) return resolve();
    stream.write('', () => resolve());
  })));
}

/** Prints the result, or writes it to `out` (its extension doesn't change the format) */
export function writeResult(value: unknown, { format, out }: { format: OutputFormat; out?: string }, io: DbIo): void {
  const text = formatResult(value, format);
  if (!out) {
    io.out(text);
    return;
  }
  const file = path.resolve(out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}\n`);
  io.err(`Wrote ${file}`);
}
