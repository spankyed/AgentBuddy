import {DatabaseResultsTable} from './DatabaseResultsTable';
import {QueryEditorPanel} from './QueryEditorPanel';
import {SchemaPanel} from './SchemaPanel';
import type {DatabaseSurfaceState} from './databaseTypes';
import {makeStyles} from '../primitives/makeStyles';
import './DatabaseSurface.module.css';

const styles = makeStyles('DatabaseSurface');

export function DatabaseSurface({state}: {state: DatabaseSurfaceState}) {
  return (
    <div className={styles.root}>
      <div className={styles.schemaPanel}>
        <SchemaPanel state={state} />
      </div>
      <main className={styles.main}>
        <section className={styles.queryPanel}>
          <QueryEditorPanel state={state} />
        </section>
        {state.activeMode === 'examples' ? null : (
          <section className={styles.resultsPanel}>
            <DatabaseResultsTable state={state} />
          </section>
        )}
      </main>
    </div>
  );
}
