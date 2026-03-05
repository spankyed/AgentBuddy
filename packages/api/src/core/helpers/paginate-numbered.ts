/*───────────────────────────────────────────────────────────────────────────
 * pagination.expectedTotal.ts – numbered pages with auto‑adjust, no shift flag
 *───────────────────────────────────────────────────────────────────────────*/

export interface PaginateOpts {
  /** 1‑based page number requested (default 1) */
  page?: number;
  /** Items per page (default 50) */
  perPage?: number;
  /** Sort order before slicing */
  order?: 'asc' | 'desc';
  /** Caller’s last known total row count (optional) */
  expectedTotal?: number;
}

export interface NumberedPage<T> {
  items: T[];
  page: number;        // 1‑based page actually delivered
  perPage: number;
  total: number;       // collection size *now*
  pageCount: number;   // Math.ceil(total/perPage)
}

export function paginateNumbered<T>(
  source: readonly T[],
  { page = 1, perPage = 50, order = 'asc', expectedTotal }: PaginateOpts = {},
): NumberedPage<T> {
  const data = order === 'desc' ? [...source].reverse() : source;
  const total = data.length;

  // If rows were deleted and the requested page is now out of range,
  // shift to the last valid page. (If rows were appended we honour the
  // requested page; it still exists.)
  let currentPage = Math.max(1, page);
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  if (expectedTotal !== undefined && expectedTotal > total && currentPage > maxPage) {
    currentPage = maxPage;
  }

  const start = (currentPage - 1) * perPage;
  const items = data.slice(start, start + perPage);

  return { items, page: currentPage, perPage, total, pageCount: maxPage };
}
