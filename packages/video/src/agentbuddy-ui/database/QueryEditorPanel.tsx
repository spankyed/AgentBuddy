import {MonacoCodeViewer} from '../code/MonacoCodeViewer';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function QueryEditorPanel({state}: {state: DatabaseSurfaceState}) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.left}>
          <div className={styles.tabs}>
            <span className={`${styles.tab} ${state.activeMode === 'query' ? styles.tabActive : ''}`}>Query</span>
            <span className={`${styles.tab} ${state.activeMode === 'examples' ? styles.tabActive : ''}`}>Examples</span>
          </div>
          <div className={styles.separator} />
          <div className={styles.iconButton} title="Clear query"><Icons.FileX size={16} /></div>
          <div className={`${styles.iconButton} ${state.aiPromptOpen ? styles.aiActive : ''}`} title="Generate query with AI"><Icons.Wand2 size={16} /></div>
          <div className={styles.keyboard}><Icons.Keyboard size={12} /> Cmd + Enter to run</div>
        </div>
        <div className={styles.right}>
          {state.statusMessage ? <div className={styles.success}><Icons.CircleCheck size={14} /> {state.statusMessage}</div> : null}
          <div className={styles.actions}>
            <div className={styles.modeButton}>
              {state.mode === 'query' ? <Icons.Database size={14} /> : <Icons.Edit3 size={14} />}
              {state.mode === 'query' ? 'Query' : 'Transaction'}
            </div>
            <div className={styles.separator} />
            <div className={styles.executeButton}>
              {state.isLoading ? <Icons.Loader2 size={14} /> : <Icons.Play size={14} />}
              {state.isLoading ? 'Running...' : 'Execute'}
            </div>
          </div>
        </div>
      </header>
      {state.aiPromptOpen ? (
        <div className={styles.prompt}>
          <div className={styles.promptText}>Describe what you want to query...</div>
        </div>
      ) : null}
      <div className={styles.editor}>
        <MonacoCodeViewer value={state.query} language="typescript" />
      </div>
    </div>
  );
}
