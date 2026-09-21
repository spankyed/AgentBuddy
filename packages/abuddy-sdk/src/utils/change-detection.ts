export type DiffResult<T> =
  | null
  | { renames: Array<{ from: string; to: string }>; added: T[]; removed: T[] };

export const detectChanges = <T>(
  prev: T[] | undefined,
  next: T[] | undefined,
  id: (x: T) => string,
  key: (x: T) => string,
): DiffResult<T> => {
  if (!prev || !next) return null;
  const prevById = new Map(prev.map(x => [id(x), x]));
  const nextById = new Map(next.map(x => [id(x), x]));
  const nextIdByKey = new Map(next.map(x => [key(x), id(x)]));
  const renames = prev
    .filter(p => !nextById.has(id(p)))
    .map(p => ({ from: id(p), to: nextIdByKey.get(key(p)) }))
    .filter((r): r is { from: string; to: string } => !!r.to && !prevById.has(r.to));
  const fromSet = new Set(renames.map(r => r.from));
  const toSet   = new Set(renames.map(r => r.to));
  const added   = next.filter(x => !prevById.has(id(x)) && !toSet.has(id(x)));
  const removed = prev.filter(x => !nextById.has(id(x)) && !fromSet.has(id(x)));
  return renames.length || added.length || removed.length ? { renames, added, removed } : null;
};

type DiffItem = Record<string, unknown>;

/** What changed in each array of a record, by the array's key (`detectAllArrayChanges`) */
export type ArrayChanges = Record<string, DiffResult<DiffItem>>;

export const detectAllArrayChanges = (prev: unknown, next: unknown): ArrayChanges | null => {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return null;
  const changes: Record<string, DiffResult<DiffItem>> = {};
  const detectInObject = (prevObj: Record<string, unknown> | undefined, nextObj: Record<string, unknown>, path: string[] = []) => {
    for (const key in nextObj) {
      const prevVal = prevObj?.[key];
      const nextVal = nextObj[key];
      if (Array.isArray(nextVal) && Array.isArray(prevVal)) {
        if (nextVal.length > 0 && typeof nextVal[0] === 'object') {
          const diff = detectArrayChanges(prevVal as DiffItem[], nextVal as DiffItem[]);
          if (diff) changes[[...path, key].join('.') || key] = diff;
        }
      } else if (typeof nextVal === 'object' && nextVal !== null && !Array.isArray(nextVal)) {
        detectInObject(prevVal as Record<string, unknown> | undefined, nextVal as Record<string, unknown>, [...path, key]);
      }
    }
  };
  detectInObject(prev as Record<string, unknown>, next as Record<string, unknown>);
  return Object.keys(changes).length > 0 ? changes : null;
};

const detectArrayChanges = (prev: DiffItem[], next: DiffItem[]): DiffResult<DiffItem> => {
  if (!prev.length || !next.length) return null;
  if (typeof prev[0] !== 'object' || typeof next[0] !== 'object') return null;
  const idFields = ['id', 'label', 'name', 'key', 'code'];
  const idField = idFields.find(f => Object.prototype.hasOwnProperty.call(prev[0], f));
  if (!idField) return null;
  const matchFields = ['color', 'value', 'icon'];
  const matchField = matchFields.find(f => Object.prototype.hasOwnProperty.call(prev[0], f)) || idField;
  return detectChanges(prev, next, item => String(item[idField]), item => String(item[matchField]));
};
