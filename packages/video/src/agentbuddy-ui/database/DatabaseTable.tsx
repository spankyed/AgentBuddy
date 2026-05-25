import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './DatabaseTable.module.css';

const styles = makeStyles('DatabaseTable');

export function DatabaseTable({state}: {state: DatabaseSurfaceState}) {
  return (
    <section className={styles.root}>
      <table className={styles.table}>
        <thead>
          <tr>
            {state.tableColumns.map(column => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {state.rows.map(row => (
            <tr key={row.id} className={row.selected ? styles.selected : undefined}>
              {row.columns.map((column, index) => <td key={`${row.id}-${index}`}>{column}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
