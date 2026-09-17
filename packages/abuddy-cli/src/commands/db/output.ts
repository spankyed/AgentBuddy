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

export function toJSON(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2) ?? 'undefined';
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows of objects as CSV with a column per key any row has; one object is one row; anything else one cell */
export function toCSV(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
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
