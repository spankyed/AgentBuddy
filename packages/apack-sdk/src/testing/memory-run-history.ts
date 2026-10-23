import { createMemoryRecordStore, type RecordStore } from '@apackdev/ears';
import { _RUN_HISTORY_INDEXES, type RunNode } from '../services/run-history.ts';

/** @internal A run history's record store in memory, indexed as the app's on disk is: the test runtime's, and a spec's */
export function _memoryRunHistoryStore(): RecordStore<RunNode> {
  return createMemoryRecordStore({ indexes: _RUN_HISTORY_INDEXES });
}
