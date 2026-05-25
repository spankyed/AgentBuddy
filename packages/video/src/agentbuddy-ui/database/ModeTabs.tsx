import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function ModeTabs({activeMode}: {activeMode: DatabaseSurfaceState['activeMode']}) {
  return (
    <div className={styles.tabs}>
      <span className={`${styles.tab} ${activeMode === 'query' ? styles.tabActive : ''}`}>Query</span>
      <span className={`${styles.tab} ${activeMode === 'examples' ? styles.tabActive : ''}`}>Examples</span>
    </div>
  );
}
