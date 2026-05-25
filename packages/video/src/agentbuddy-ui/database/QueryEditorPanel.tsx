import {MonacoCodeViewer} from '../code/MonacoCodeViewer';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import {QueryEditorExamples} from './QueryEditorExamples';
import {QueryEditorHeader} from './QueryEditorHeader';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function QueryEditorPanel({state}: {state: DatabaseSurfaceState}) {
  return (
    <div className={styles.root}>
      <QueryEditorHeader state={state} />
      {state.aiPromptOpen ? (
        <div className={styles.prompt}>
          <div className={styles.promptBody}>
            <textarea value="Find active launch threads with linked PR state" readOnly />
            <button>↵</button>
          </div>
        </div>
      ) : null}
      <div className={styles.editor}>
        {state.activeMode === 'query' ? <MonacoCodeViewer value={state.query} language="typescript" /> : <QueryEditorExamples examples={state.examples} />}
        {state.isAiQueryLoading && state.activeMode === 'query' ? (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <div>Generating {state.mode === 'transaction' ? 'transaction' : 'query'} from prompt...</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
