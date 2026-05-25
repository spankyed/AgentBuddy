import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {LogsSurfaceState} from './logTypes';
import './LogsSidebar.module.css';

const styles = makeStyles('LogsSidebar');

export function LogsSidebar({state}: {state: LogsSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>Streams</header>
      <div className={styles.list}>
        {state.services.map(service => (
          <div key={service.id} className={cx(styles.service, service.id === state.activeService && styles.active)}>
            <span className={cx(styles.dot, service.status === 'warning' && styles.warning, service.status === 'down' && styles.down)} />
            <span>{service.label}</span>
            <span className={styles.count}>{service.count}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
