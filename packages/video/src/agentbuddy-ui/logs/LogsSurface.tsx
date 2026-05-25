import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {LogRow} from './LogRow';
import {LogsHeader} from './LogsHeader';
import type {LogEntry, LogsSurfaceState} from './logTypes';
import './LogsSurface.module.css';

const styles = makeStyles('LogsSurface');

type LogsSurfaceProps = {
  state: LogsSurfaceState;
};

export function LogsSurface({state}: LogsSurfaceProps) {
  const filteredLogs = filterLogs(state);
  const displayedLogs = filteredLogs.slice(0, 100);
  const hasMore = displayedLogs.length < filteredLogs.length;

  return (
    <div className={styles.root}>
      <LogsHeader filteredCount={filteredLogs.length} state={state} />

      <div className={styles.content}>
        {filteredLogs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              {state.logs.length === 0 ? <Icons.Terminal size={24} /> : <Icons.Search size={24} />}
            </div>
            <h3>{state.logs.length === 0 ? 'No logs yet' : 'No matching logs'}</h3>
            <p>{state.logs.length === 0 ? 'Logs from your backend will appear here.' : 'Try adjusting your search or filters.'}</p>
            {state.logs.length > 0 ? <button type="button">Show all logs</button> : null}
          </div>
        ) : (
          <div>
            {displayedLogs.map(log => (
              <LogRow expandedContent={state.expandedContent[log.id]} key={log.id} log={log} />
            ))}
            {hasMore ? (
              <div className={styles.more}>
                Showing {displayedLogs.length} of {filteredLogs.length} logs
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function filterLogs(state: LogsSurfaceState) {
  let logs = state.logs;
  if (state.filterLevel !== 'all') {
    logs = logs.filter(log => log.level === state.filterLevel);
  }
  if (state.searchTerm.trim()) {
    const query = state.searchTerm.toLowerCase();
    logs = logs.filter(log => (
      log.message.toLowerCase().includes(query) ||
      log.level.toLowerCase().includes(query) ||
      (log.source?.toLowerCase().includes(query) ?? false)
    ));
  }
  return logs;
}
