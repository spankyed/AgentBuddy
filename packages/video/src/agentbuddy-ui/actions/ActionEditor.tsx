import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ActionsSurfaceState} from './actionTypes';
import './ActionEditor.module.css';

const styles = makeStyles('ActionEditor');

export function ActionEditor({state}: {state: ActionsSurfaceState}) {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <span>release/checklist.ts</span>
        <span className={styles.run}><Icons.Play size={13} /> Run</span>
      </header>
      <pre className={styles.code}>{state.actionCode}</pre>
    </main>
  );
}
