import {DatabaseSidebar} from './DatabaseSidebar';
import {DatabaseTable} from './DatabaseTable';
import {QueryEditor} from './QueryEditor';
import {RecordInspector} from './RecordInspector';
import type {DatabaseSurfaceState} from './databaseTypes';
import {makeStyles} from '../primitives/makeStyles';
import './DatabaseSurface.module.css';

const styles = makeStyles('DatabaseSurface');

export function DatabaseSurface({state}: {state: DatabaseSurfaceState}) {
  return (
    <div className={styles.root}>
      <DatabaseSidebar state={state} />
      <main className={styles.main}>
        <QueryEditor query={state.query} />
        <DatabaseTable state={state} />
      </main>
      <RecordInspector state={state} />
    </div>
  );
}
