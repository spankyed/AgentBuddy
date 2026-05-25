import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './RecordInspector.module.css';

const styles = makeStyles('RecordInspector');

export function RecordInspector({state}: {state: DatabaseSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>{state.detail.title}</header>
      <div className={styles.list}>
        {state.detail.fields.map(field => (
          <div key={field.label} className={styles.field}>
            <span className={styles.label}>{field.label}</span>
            <span className={styles.value}>{field.value}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
