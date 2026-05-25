import {DatabaseResultsTable} from './DatabaseResultsTable';
import type {DatabaseSurfaceState} from './databaseTypes';
import {QueryEditorPanel} from './QueryEditorPanel';
import {SchemaPanel} from './SchemaPanel';
import {makeStyles} from '../primitives/makeStyles';
import './DatabaseSurface.module.css';

const styles = makeStyles('DatabaseSurface');

type DatabaseSurfaceProps = {
  state: DatabaseSurfaceState;
};

export function DatabaseSurface({state}: DatabaseSurfaceProps) {
  return (
    <div className={styles.root}>
      <div className={styles.schemaPanel}>
        <SchemaPanel schema={state.schema} searchQuery={state.searchQuery} selectedItemId={state.selectedSchemaItemId} />
        <div className={styles.schemaResizeHandle}>
          <div />
        </div>
      </div>
      <div className={styles.main}>
        <div className={state.activeMode === 'examples' ? styles.queryPanelFull : styles.queryPanel}>
          <QueryEditorPanel state={state} />
          {state.activeMode !== 'examples' ? (
            <div className={styles.queryResizeHandle}>
              <div />
            </div>
          ) : null}
        </div>
        {state.activeMode !== 'examples' ? (
          <div className={styles.resultsPanel}>
            <DatabaseResultsTable error={state.error} executionTime={state.executionTime} isLoading={state.isLoading} rows={state.queryResult} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
