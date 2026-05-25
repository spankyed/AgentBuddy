import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './DatabaseSidebar.module.css';

const styles = makeStyles('DatabaseSidebar');

export function DatabaseSidebar({state}: {state: DatabaseSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <Icons.Database size={15} />
        <span className={styles.connection}>{state.connectionName}</span>
        <Icons.RotateCcw size={14} />
      </header>
      {state.databases.map(database => (
        <section key={database.id} className={styles.section}>
          <div className={styles.databaseLabel}>
            <Icons.ChevronDown size={13} />
            {database.label}
          </div>
          {database.tables.map(table => (
            <div key={table.id} className={`${styles.table} ${table.id === state.activeTableId ? styles.activeTable : ''}`}>
              <span>{table.label}</span>
              <span className={styles.count}>{table.count}</span>
            </div>
          ))}
        </section>
      ))}
    </aside>
  );
}
