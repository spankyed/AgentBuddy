/**
 * Generic change detection for arrays of objects.
 * Detects renames, additions, and removals by comparing identity and match keys.
 */

export type DiffResult<T> =
  | null
  | {
      renames: Array<{ from: string; to: string }>;
      added: T[];
      removed: T[];
    };

export const detectChanges = <T>(
  prev: T[] | undefined,
  next: T[] | undefined,
  id: (x: T) => string,
  key: (x: T) => string
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

export const detectAllArrayChanges = (prev: any, next: any): Record<string, DiffResult<any>> | null => {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return null;

  const changes: Record<string, DiffResult<any>> = {};

  const detectInObject = (prevObj: any, nextObj: any, path: string[] = []) => {
    for (const key in nextObj) {
      const prevVal = prevObj?.[key];
      const nextVal = nextObj[key];

      if (Array.isArray(nextVal) && Array.isArray(prevVal)) {
        if (nextVal.length > 0 && typeof nextVal[0] === 'object') {
          const diff = detectArrayChanges(prevVal, nextVal);
          if (diff) {
            const pathKey = [...path, key].join('.');
            changes[pathKey || key] = diff;
          }
        }
      } else if (typeof nextVal === 'object' && nextVal !== null && !Array.isArray(nextVal)) {
        detectInObject(prevVal, nextVal, [...path, key]);
      }
    }
  };

  detectInObject(prev, next);
  return Object.keys(changes).length > 0 ? changes : null;
};

const detectArrayChanges = (prev: any[], next: any[]): DiffResult<any> => {
  if (!prev.length || !next.length) return null;
  if (typeof prev[0] !== 'object' || typeof next[0] !== 'object') return null;

  const idFields = ['id', 'label', 'name', 'key', 'code'];
  const idField = idFields.find(f => prev[0].hasOwnProperty(f));
  if (!idField) return null;

  const matchFields = ['color', 'value', 'icon'];
  const matchField = matchFields.find(f => prev[0].hasOwnProperty(f)) || idField;

  return detectChanges(
    prev,
    next,
    item => String(item[idField]),
    item => String(item[matchField])
  );
};
