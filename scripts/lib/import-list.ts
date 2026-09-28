/**
 * What `check:specifiers --list` prints: each rule as a row, then what an external pack does without the rules
 * this repo keeps to itself.
 *
 * The definition, not the command — `scripts/check-import-specifiers.ts` runs it and owns the rules. Nothing
 * here reads `CHECKS`: every function takes the rules, so a case can render a parity no real rule has yet.
 */
import type { ImportRule, PackParity } from './import-rules.ts';

/**
 * One rule as `--list` shows it. Rendered cells rather than the rule itself, so the widths below are derived
 * from the text that will actually be printed and a caller cannot compose a column a different way.
 */
export interface RuleRow {
  readonly id: string;
  /** Whether it can be pointed at paths, which is what decides if a per-file run covers it */
  readonly paths: string;
  /** Whether an external pack is held to it too: `abuddy validate`, `build` and `test` run the pack rules */
  readonly parity: string;
  /** The first clause of what it reports, which is the part that fits a row */
  readonly reports: string;
}

/** What each answer means, in the order the second table groups them: the gap last, where it is read */
const PARITY_HEADINGS: Record<PackParity['kind'], string> = {
  covered: 'A pack rule covers the pack-facing half:',
  inapplicable: 'A pack cannot commit the offence:',
  unenforced: 'A pack can commit it and nothing checks — move it to PACK_RULES or say why not:',
};

/**
 * The rows `--list` prints, as data.
 *
 * Separate from the printing because the pairing is the only thing the table is for, and a row is the only place
 * an id and its parity are together — asserted over these, a rule rendered with another rule's key fails, where
 * over the command's stdout every string is still present and every `toContain` still passes.
 *
 * Takes the rules so a case can render a parity a real rule does not have yet.
 */
export const ruleRows = (checks: readonly ImportRule[]): readonly RuleRow[] => checks.map((rule) => ({
  id: rule.id,
  paths: rule.overPaths ? 'yes' : 'no',
  parity: rule.packRule === undefined ? 'no — see below' : `yes, as \`${rule.packRule}\``,
  reports: rule.rule.split(':')[0],
}));

/**
 * Those rows as lines, each column as wide as its own longest entry: a width guessed from today's entries is one
 * the next rule runs off the end of, and the entry that does it is the one nobody reads twice.
 */
export const ruleTable = (rows: readonly RuleRow[]): string[] => {
  const width = (header: string, cell: (row: RuleRow) => string) => Math.max(header.length, ...rows.map((row) => cell(row).length)) + 2;
  const columns = [
    ['rule', width('rule', (row) => row.id), (row: RuleRow) => row.id],
    ['paths?', width('paths?', (row) => row.paths), (row: RuleRow) => row.paths],
    ['a pack too?', width('a pack too?', (row) => row.parity), (row: RuleRow) => row.parity],
    ['what it reports', 0, (row: RuleRow) => row.reports],
  ] as const;
  const line = (cell: (column: (typeof columns)[number]) => string) =>
    columns.map((column) => cell(column).padEnd(column[1])).join('').trimEnd();
  return [line((column) => column[0]), ...rows.map((row) => line((column) => column[2](row)))];
};

/**
 * The whole of what `--list` prints, as lines.
 *
 * Here rather than in the runner because the second half is the part with a shape: the rules this repo keeps to
 * itself, grouped by what a pack does without each. A caller prints them.
 */
export const listLines = (checks: readonly ImportRule[]): string[] => {
  const repoOnly = checks.filter((rule) => rule.repoOnly !== undefined);
  const lines = [...ruleTable(ruleRows(checks)),
    `\n${repoOnly.length} of ${checks.length} are this repo's alone. What an external pack does without each:\n`];
  for (const [kind, heading] of Object.entries(PARITY_HEADINGS)) {
    const group = repoOnly.filter((rule) => rule.repoOnly!.kind === kind);
    if (group.length === 0) continue;
    lines.push(`  ${heading}\n`);
    for (const rule of group) {
      const parity = rule.repoOnly!;
      lines.push(`    ${rule.id}${parity.kind === 'covered' ? ` — held as \`${parity.by}\`` : ''}\n      ${parity.note}\n`);
    }
  }
  return lines;
};
