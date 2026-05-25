import {makeStyles} from '../primitives/makeStyles';
import type {ActionsSurfaceState} from './actionTypes';
import './ActionRunPanel.module.css';

const styles = makeStyles('ActionRunPanel');

export function ActionRunPanel({state}: {state: ActionsSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>Run Context</header>
      <section className={styles.section}>
        <div className={styles.label}>Environment</div>
        {state.environment.map(item => (
          <div key={item.key} className={styles.env}>
            <span>{item.key}</span>
            <span className={styles.value}>{item.value}</span>
          </div>
        ))}
      </section>
      <section className={styles.section}>
        <div className={styles.label}>Runs</div>
        {state.runs.map(run => (
          <div key={run.id} className={styles.run}>
            <span className={styles[run.status]}>{run.summary}</span>
            <span className={styles.time}>{run.time}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}
