// Normalising emitted TypeScript declarations, so the same sources produce the same bytes.
//
// Here, rather than beside either caller, because there are two and they cannot reach each other: the CLI's
// declaration bundler is package source and may not import the repo's `scripts/`, and `scripts/` cannot
// import `@abuddy/cli`, which publishes no exports map. `@abuddy/host/build` is what both already import
// from, so it is where a thing they share belongs — and one of them holding the copy is how this came to be
// applied to a recorded report for years while the artifact it was derived from stayed unstable.
import ts from 'typescript';

/**
 * A declaration bundle with every all-literal union's members sorted (`"b" | "a"` → `"a" | "b"`).
 *
 * TypeScript prints an inferred union in the order it created the member types, and that order changes
 * between builds, so identical sources emit different bytes. Measured 2026-09-28: the pack's
 * `action-defs.d.ts` took five distinct hashes in six builds and `pack-types.d.ts` moved with it, which made
 * every chain step caching on `packages/default-setup/dist` go stale for files whose meaning never changed.
 * Sorting is safe because a union's order does not change the type.
 *
 * **Only unions whose members are *all* literals.** `Foo | Bar` is left alone: sorting type references would
 * reorder text whose order this has no evidence varies, and `npm run check:repro` is what would report it if
 * a non-literal union ever did — widen this deliberately then, with the measurement, rather than pre-emptively.
 *
 * Malformed input degrades rather than throwing: `createSourceFile` is error-tolerant, so the unions it did
 * parse are still sorted. That is checked, because the alternative — silently returning the input — would
 * make this look applied while doing nothing.
 */
export function sortLiteralUnions(bundle: string, fileName = 'bundle.d.ts'): string {
  const file = ts.createSourceFile(fileName, bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isUnionTypeNode(node) && node.types.every((member) => ts.isLiteralTypeNode(member))) {
      edits.push({ start: node.getStart(file), end: node.end, text: node.types.map((member) => member.getText(file)).sort().join(' | ') });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Right to left, so an earlier edit's offsets still refer to the text they were taken from
  return edits.reverse().reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), bundle);
}
