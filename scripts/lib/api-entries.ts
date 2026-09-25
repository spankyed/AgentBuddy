/**
 * Which subpaths of a published package get an API report, and what that report is called.
 *
 * One derivation, imported by both the thing that writes the reports (`api-reports.ts`) and the thing that
 * decides whether they are stale (`api-report-stamp.ts`). They had two, and the stamp's did not exist: it
 * hashed the declarations and nothing else, so its own claim — that a matching stamp means `api:check`
 * cannot fail — was false for the one input it left out. Adding `./packs` to a map passed `api:stamp`, and
 * the whole chain with it, while `api:check` refused for want of `etc/packs.api.md`.
 *
 * A report is a pure function of the declarations *and the set of entries*, because there is one report per
 * entry. Deriving both from `exports` is what keeps the two from disagreeing again.
 */

/** The `exports` keys that get a report: the ones declaring `types`, in the order the manifest lists them */
export function reportEntries(pkg: { exports?: Record<string, unknown> }): string[] {
  return Object.entries(pkg.exports ?? {}).flatMap(([key, target]) =>
    typeof target === 'object' && target !== null && 'types' in target ? [key] : []);
}

/** `.` → `index.api.md`, `./fe` → `fe.api.md`, `./a/b` → `a.b.api.md` */
export const reportName = (key: string): string => `${key === '.' ? 'index' : key.slice(2).replaceAll('/', '.')}.api.md`;
