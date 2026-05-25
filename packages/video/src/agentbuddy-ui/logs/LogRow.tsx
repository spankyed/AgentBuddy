import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {LogEntry} from './logTypes';
import './LogRow.module.css';

const styles = makeStyles('LogRow');

export function LogRow({log}: {log: LogEntry; searchTerm: string}) {
  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <div className={`${styles.icon} ${styles[log.level]}`}>
          <LevelIcon level={log.level} />
        </div>
        <div className={styles.message}>{log.message}</div>
        <div className={styles.meta}>
          {log.source ? <span className={styles.source}>{log.source}</span> : null}
          <span className={styles.time}>{log.timestamp}</span>
          <span className={styles.chevron}>{log.meta ? <Icons.ChevronRight size={12} style={{transform: log.expanded ? 'rotate(90deg)' : undefined}} /> : null}</span>
        </div>
      </div>
      {log.expanded && log.meta ? (
        <div className={styles.expanded}>
          <div className={styles.expandedInner}>
            <div className={styles.expandedTitle}>Metadata</div>
            <pre className={styles.data}>{JSON.stringify(log.meta, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LevelIcon({level}: {level: LogEntry['level']}) {
  if (level === 'debug') return <Icons.Bug size={14} />;
  if (level === 'info') return <Icons.Info size={14} />;
  if (level === 'warn') return <Icons.AlertTriangle size={14} />;
  return <Icons.AlertCircle size={14} />;
}
