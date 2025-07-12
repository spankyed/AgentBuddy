/*───────────────────────────────────────────────────────────────────────────
 * pagination.ts – drop-in helpers for any array-returning query
 *───────────────────────────────────────────────────────────────────────────*/
export interface PaginationOpts {
  /** Max items to return (defaults to 50, hard-cap where you like) */
  limit?: number;
  /** Base64-encoded index returned by the previous page */
  cursor?: string | null;
  /** Optional client-supplied sort; fallback is insertion order */
  order?: "asc" | "desc";
}

export interface Page<T> {
  items: T[];
  /** Total items *right now* (useful for page indicators) */
  total: number;
  /** Cursor to pass back on the next call, or null if no more data */
  nextCursor: string | null;
}

const idxToCursor = (i: number) => Buffer.from(String(i), "utf8").toString("base64");
const cursorToIdx = (c: string | null) =>
  c ? Number.parseInt(Buffer.from(c, "base64").toString("utf8"), 10) : 0;

/** Generic array paginator */
export function paginateArray<T>(
  source: readonly T[],
  { limit = 50, cursor = null, order = "asc" }: PaginationOpts = {},
): Page<T> {
  const data = order === "desc" ? [...source].reverse() : source;
  const start = cursorToIdx(cursor);
  const slice = data.slice(start, start + limit);
  const nextCursor = start + limit < data.length ? idxToCursor(start + limit) : null;
  return { items: slice, total: data.length, nextCursor };
}