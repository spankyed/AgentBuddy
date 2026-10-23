import { _createRunHistory, type _RunHistoryRecords, type RunHistory } from '@apackdev/sdk/services';
import { createLogger } from '@apackdev/sdk/logger';

const logger = createLogger('run-history');

/** How long a run is kept once its session has ended: older runs are removed, whole, as the history opens */
export const RUN_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The app's run history over its store (`openRunHistoryStore`). As it opens, what a session left `active` — the app
 * quit or crashed mid-run — is marked `stopped`, so no run reads as still going after it can't be, and every session
 * that ended more than `RUN_HISTORY_RETENTION_MS` ago is removed with all it ran. A session the app stopped this way
 * ended now, so it is kept for the full period from here.
 */
export function createRunHistory(store: _RunHistoryRecords): RunHistory {
  const history = _createRunHistory(store);
  history.stopActive();
  const removed = history.prune({ before: Date.now() - RUN_HISTORY_RETENTION_MS });
  if (removed > 0) logger.info(`Removed ${removed} run(s) older than ${RUN_HISTORY_RETENTION_MS / 86_400_000} days`);
  return history;
}
