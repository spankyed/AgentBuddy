import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function QueryEditorActions({isDisabled, isLoading, mode}: {isDisabled: boolean; isLoading: boolean; mode: DatabaseSurfaceState['mode']}) {
  return (
    <div className={styles.actions}>
      <div className={`${styles.modeButton} ${mode === 'transaction' ? styles.transactionMode : ''}`}>
        {mode === 'query' ? <Icons.Database size={14} /> : <Icons.Edit3 size={14} />}
        {mode === 'query' ? 'Query' : 'Transaction'}
      </div>
      <div className={styles.separator} />
      <div className={`${styles.executeButton} ${isDisabled ? styles.executeDisabled : ''}`}>
        {isLoading ? <Icons.Loader2 size={14} /> : <Icons.Play size={14} />}
        {isLoading ? 'Running...' : 'Execute'}
      </div>
    </div>
  );
}
