/**
 * Which subpaths of a published package get an API report, and what that report is called.
 *
 * One derivation, with one consumer: `api-reports.ts`, which both writes the reports and compares them.
 *
 * It is shared code because it was once two answers. A stamp stood in for `api:check` and hashed the
 * declarations and nothing else, so its claim — that a matching stamp means `api:check` cannot fail — was
 * false for the input it left out: adding `./packs` to a map passed the stamp and the whole chain with it,
 * while `api:check` refused for want of `etc/packs.api.md`. The stamp is gone and `api:check` runs in the
 * chain, so there is no second answer to disagree with this one.
 *
 * A report is a pure function of the declarations *and the set of entries*, because there is one report per
 * entry. Deriving the entries here is what keeps every caller asking the same question.
 */

/** The `exports` keys that get a report: the ones declaring `types`, in the order the manifest lists them */
export function reportEntries(pkg: { exports?: Record<string, unknown> }): string[] {
  return Object.entries(pkg.exports ?? {}).flatMap(([key, target]) =>
    typeof target === 'object' && target !== null && 'types' in target ? [key] : []);
}

/** `.` → `index.api.md`, `./fe` → `fe.api.md`, `./a/b` → `a.b.api.md` */
export const reportName = (key: string): string => `${key === '.' ? 'index' : key.slice(2).replaceAll('/', '.')}.api.md`;
