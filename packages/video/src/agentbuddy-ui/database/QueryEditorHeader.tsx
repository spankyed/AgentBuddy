import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {KeyboardHint} from './KeyboardHint';
import {ModeTabs} from './ModeTabs';
import {QueryEditorActions} from './QueryEditorActions';
import {QueryEditorMessages} from './QueryEditorMessages';
import type {DatabaseSurfaceState} from './databaseTypes';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function QueryEditorHeader({state}: {state: DatabaseSurfaceState}) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <ModeTabs activeMode={state.activeMode} />
        <div className={styles.separator} />
        <div className={styles.iconButton} title="Clear query"><Icons.FileX size={16} /></div>
        <div className={`${styles.iconButton} ${state.aiPromptOpen ? styles.aiActive : ''}`} title="Generate query with AI"><Icons.Wand2 size={16} /></div>
        <KeyboardHint />
      </div>
      <div className={styles.right}>
        <QueryEditorMessages error={state.error} successMessage={state.statusMessage} />
        <QueryEditorActions isLoading={state.isLoading} isDisabled={!state.query.trim()} mode={state.mode} />
      </div>
    </header>
  );
}
