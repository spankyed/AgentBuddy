import { _createRunHistory, type _RunHistoryRecords, type RunHistory } from '@apackdev/sdk/services';

/**
 * The app's run history over its store (`openRunHistoryStore`). What a session left `active` — the app quit or
 * crashed mid-run — is marked `stopped` as it opens, so no run reads as still going after it can't be.
 */
export function createRunHistory(store: _RunHistoryRecords): RunHistory {
  const history = _createRunHistory(store);
  history.stopActive();
  return history;
}
