import {makeStyles} from '../primitives/makeStyles';
import type {LogsSurfaceState} from './logTypes';
import './LogsHeader.module.css';

const styles = makeStyles('LogsHeader');

export function LogsHeader({state}: {state: LogsSurfaceState}) {
  return (
    <header className={styles.root}>
      <div className={styles.search}>{state.query}</div>
      <div className={styles.meta}>
        {state.filters.map(filter => <span key={filter}>{filter}</span>)}
        <span className={styles.connected}>{state.streamState}</span>
      </div>
    </header>
  );
}
