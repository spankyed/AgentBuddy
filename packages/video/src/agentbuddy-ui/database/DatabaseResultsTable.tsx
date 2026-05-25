import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './DatabaseResultsTable.module.css';

const styles = makeStyles('DatabaseResultsTable');

export function DatabaseResultsTable({state}: {state: DatabaseSurfaceState}) {
  const count = state.resultRows.length;
  return (
    <div className={styles.root}>
      <div className={styles.container}>
        {count === 0 ? (
          <div className={styles.empty}>
            {state.isLoading ? 'Loading...' : 'Execute a query to see the results'}
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>{state.resultHeaders.map(header => <th key={header} className={styles.th}>{header}</th>)}</tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.resultRows.map((row, index) => (
                <tr key={index} className={styles.tr}>
                  {state.resultHeaders.map(header => <td key={header} className={styles.td}>{String(row[header] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <footer className={styles.infoBar}>
        <div className={styles.infoContent}>
          <div>
            {count === 0 ? (
              <span>No results</span>
            ) : (
              <>
                <span className={styles.count}>{count.toLocaleString()}</span> {count === 1 ? 'result' : 'results'}
                <span style={{marginLeft: 16}}><Icons.Code size={12} style={{verticalAlign: -2, opacity: 0.5}} /> array</span>
              </>
            )}
          </div>
          {state.executionTime !== null ? <div className={styles.time}>{state.executionTime.toFixed(2)}ms</div> : null}
        </div>
      </footer>
    </div>
  );
}
