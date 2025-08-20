/**
 * Change detection utilities for settings
 * Provides generic and specific change detection for arrays
 */

// Simple, generic API
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
  id: (x: T) => string,     // identity (label/name)
  key: (x: T) => string     // match key (e.g., color)
): DiffResult<T> => {
  if (!prev || !next) return null;

  const pid = (x: T) => id(x);
  const pkey = (x: T) => key(x);

  const prevById = new Map(prev.map(x => [pid(x), x]));
  const nextById = new Map(next.map(x => [pid(x), x]));
  const nextIdByKey = new Map(next.map(x => [pkey(x), pid(x)]));

  // renames: missing by id but present by key, to a *new* id
  const renames = prev
    .filter(p => !nextById.has(pid(p)))
    .map(p => ({ from: pid(p), to: nextIdByKey.get(pkey(p)) }))
    .filter((r): r is { from: string; to: string } => !!r.to && !prevById.has(r.to));

  const fromSet = new Set(renames.map(r => r.from));
  const toSet   = new Set(renames.map(r => r.to));

  const added   = next.filter(x => !prevById.has(pid(x)) && !toSet.has(pid(x)));
  const removed = prev.filter(x => !nextById.has(pid(x)) && !fromSet.has(pid(x)));

  return renames.length || added.length || removed.length ? { renames, added, removed } : null;
};

// Generic array change detection with field heuristics
export const detectAllArrayChanges = (prev: any, next: any): Record<string, DiffResult<any>> | null => {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return null;
  
  const changes: Record<string, DiffResult<any>> = {};
  
  // Recursively find arrays and detect changes
  const detectInObject = (prevObj: any, nextObj: any, path: string[] = []) => {
    for (const key in nextObj) {
      const prevVal = prevObj?.[key];
      const nextVal = nextObj[key];
      
      if (Array.isArray(nextVal) && Array.isArray(prevVal)) {
        // Check if array contains objects
        if (nextVal.length > 0 && typeof nextVal[0] === 'object') {
          // Try to detect changes for this array
          const diff = detectArrayChanges(prevVal, nextVal);
          if (diff) {
            const pathKey = [...path, key].join('.');
            changes[pathKey || key] = diff;
          }
        }
      } else if (typeof nextVal === 'object' && nextVal !== null && !Array.isArray(nextVal)) {
        // Recurse into nested objects
        detectInObject(prevVal, nextVal, [...path, key]);
      }
    }
  };
  
  detectInObject(prev, next);
  return Object.keys(changes).length > 0 ? changes : null;
};

// Auto-detect ID and match fields using heuristics
const detectArrayChanges = (prev: any[], next: any[]): DiffResult<any> => {
  if (!prev.length || !next.length) return null;
  if (typeof prev[0] !== 'object' || typeof next[0] !== 'object') return null;
  
  // Determine ID field (first one that exists)
  const idFields = ['id', 'label', 'name', 'key', 'code'];
  const idField = idFields.find(f => prev[0].hasOwnProperty(f));
  if (!idField) return null;
  
  // Determine match field (for detecting renames by similarity)
  const matchFields = ['color', 'value', 'icon'];
  const matchField = matchFields.find(f => prev[0].hasOwnProperty(f)) || idField;
  
  return detectChanges(
    prev, 
    next, 
    item => String(item[idField]), 
    item => String(item[matchField])
  );
};

// Thin, DRY wrappers (kept for backwards compatibility)
import type { ThreadStatusOption, Category } from './types';

export const detectStatusChanges = (prev?: ThreadStatusOption[], next?: ThreadStatusOption[]) =>
  detectChanges(prev, next, s => s.label, s => s.color);

export const detectCategoryChanges = (prev?: Category[], next?: Category[]) =>
  detectChanges(prev, next, c => c.name,  c => c.color);