import type { _RunHistoryRecords } from '../services/run-history.ts';

/**
 * @internal A record store in memory, for the test runtime's run history: the operations `openRecordStore`
 * (`@apackdev/ears/lmdb`) has, with its order (by id, so by creation for ids from `newId`) and its encoding — each
 * record goes through JSON as LMDB's does, so a value the store on disk can't hold fails here too.
 */
export function _memoryRecords(): _RunHistoryRecords {
  const records = new Map<string, string>();
  let lastTime = 0;
  let sameTime = 0;
  const decode = (json: string) => JSON.parse(json) as { id: string } & Record<string, unknown>;
  return {
    get: (id) => {
      const json = records.get(id);
      return json === undefined ? undefined : decode(json);
    },
    put: (record) => { records.set(record.id, JSON.stringify(record)); },
    delete: (id) => { records.delete(id); },
    findBy(field, value, { reverse = false, limit, cursor } = {}) {
      let found = [...records.values()].map(decode).filter((record) => record[field] === value)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      if (reverse) found.reverse();
      if (cursor !== undefined) found = found.filter((record) => (reverse ? record.id < cursor : record.id > cursor));
      return found.slice(0, limit);
    },
    newId(prefix) {
      const now = Date.now();
      if (now > lastTime) { lastTime = now; sameTime = 0; } else sameTime++;
      return `${prefix}-${lastTime.toString(36).padStart(9, '0')}${sameTime.toString(36).padStart(4, '0')}`;
    },
  };
}
