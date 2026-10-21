// The two AppState attributes that named the frontend actor a plugin. The row's other attributes are
// untouched, and nothing reads the old names after this: `FIELDS` in ../../app-state/index.ts is what
// `stored()` reads back, so a name it no longer lists is not a fallback but simply gone.
import { untypedQx, untypedTx, type EARS } from '@apackdev/ears';

const APP_STATE_ID = 'AppState-app' as EARS.EntityId;

/** What this migration moves: the attribute it reads, and the one it writes. */
const MOVES = [['pluginVisibility', 'surfaceVisibility'], ['lastActivePlugin', 'lastActiveSurface']] as const;

/**
 * Guarded per attribute rather than per row, because the two are independent: a user who never opened a
 * second surface has `pluginVisibility` and no `lastActivePlugin`, and a development boot runs this again
 * on every start.
 *
 * **Absent is `null` here, not `undefined`** — what `pickOne` answers for an attribute the row does not
 * carry, and for a row that does not exist. Guarding on `undefined` made the second run write `null` over
 * what the first had moved, which is the case below that caught it.
 */
export function up(): void {
  const row = untypedQx(APP_STATE_ID).pickOne(MOVES.map(([from]) => from)) as Record<string, unknown> | null;
  if (row == null) return;
  for (const [from, to] of MOVES) {
    if (row[from] == null) continue;
    untypedTx(APP_STATE_ID).update(to, row[from]).drop(from as EARS.AttrKind);
  }
}
