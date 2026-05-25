import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {LogRow} from './LogRow';
import type {LogLevel, LogsSurfaceState} from './logTypes';
import './LogsSurface.module.css';

const styles = makeStyles('LogsSurface');

export function LogsSurface({state}: {state: LogsSurfaceState}) {
  const counts = countLevels(state.logs);
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.toolbar}>
            <div className={styles.left}>
              <div className={styles.search}>
                <Icons.Search className={styles.searchIcon} />
                <div className={styles.searchInput}>{state.searchTerm || 'Filter logs by message, level, or source...'}</div>
              </div>
              <div className={styles.pills}>
                <Pill label="All" count={state.logs.length} active={state.filterLevel === 'all'} />
                <Pill label="" level="debug" count={counts.debug} active={state.filterLevel === 'debug'} icon={<Icons.Bug size={14} />} />
                <Pill label="" level="info" count={counts.info} active={state.filterLevel === 'info'} icon={<Icons.Info size={14} />} />
                <Pill label="" level="warn" count={counts.warn} active={state.filterLevel === 'warn'} icon={<Icons.AlertTriangle size={14} />} />
                <Pill label="" level="error" count={counts.error} active={state.filterLevel === 'error'} icon={<Icons.AlertCircle size={14} />} />
              </div>
              <div className={styles.toggle}><Icons.Radio size={14} /> app-events</div>
              {state.excludedSources > 0 ? (
                <div className={styles.excluded}><Icons.AlertTriangle size={14} /> {state.excludedSources} sources excluded</div>
              ) : null}
            </div>
            <div className={styles.right}>
              <div className={styles.action}>{state.copied ? <Icons.Check size={16} /> : <Icons.Copy size={16} />} {state.copied ? 'Copied' : 'Copy'}</div>
              <div className={styles.action}><Icons.Trash2 size={16} /> Clear</div>
            </div>
          </div>
        </div>
      </header>
      <main className={styles.content}>
        {state.logs.length === 0 ? (
          <div className={styles.empty}>No logs yet</div>
        ) : (
          state.logs.map(log => <LogRow key={log.id} log={log} searchTerm={state.searchTerm} />)
        )}
      </main>
    </div>
  );
}

function Pill({active, count, icon, label, level}: {active: boolean; count: number; icon?: React.ReactNode; label: string; level?: LogLevel}) {
  if (count === 0 && level) return null;
  return (
    <div className={`${styles.pill} ${active ? styles.pillActive : ''} ${level ? styles[level] : ''}`}>
      {icon}
      {label}
      <span>{count}</span>
    </div>
  );
}

function countLevels(logs: LogsSurfaceState['logs']) {
  return logs.reduce<Record<LogLevel, number>>((counts, log) => {
    counts[log.level] += 1;
    return counts;
  }, {debug: 0, info: 0, warn: 0, error: 0});
}
