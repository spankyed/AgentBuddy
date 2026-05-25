import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {LogsSurfaceState} from './logTypes';
import './LogStream.module.css';

const styles = makeStyles('LogStream');

export function LogStream({state}: {state: LogsSurfaceState}) {
  return (
    <section className={styles.root}>
      {state.events.map(event => (
        <div key={event.id} className={styles.row}>
          <span className={styles.time}>{event.time}</span>
          <span className={cx(styles.level, styles[event.level])}>{event.level}</span>
          <span className={styles.service}>{event.service}</span>
          <span className={styles.message}>{event.message}</span>
        </div>
      ))}
    </section>
  );
}
