import {makeStyles} from '../primitives/makeStyles';
import {LogsHeader} from './LogsHeader';
import {LogsSidebar} from './LogsSidebar';
import {LogStream} from './LogStream';
import type {LogsSurfaceState} from './logTypes';
import './LogsSurface.module.css';

const styles = makeStyles('LogsSurface');

export function LogsSurface({state}: {state: LogsSurfaceState}) {
  return (
    <div className={styles.root}>
      <LogsSidebar state={state} />
      <main className={styles.main}>
        <LogsHeader state={state} />
        <LogStream state={state} />
      </main>
    </div>
  );
}
