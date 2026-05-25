import {makeStyles} from '../primitives/makeStyles';
import type {PromptSurfaceState} from './promptTypes';
import './PromptEditor.module.css';

const styles = makeStyles('PromptEditor');

export function PromptEditor({state}: {state: PromptSurfaceState}) {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <span>launch-planner.prompt.md</span>
        <span className={styles.save}>Save</span>
      </header>
      <pre className={styles.text}>{state.draft}</pre>
    </main>
  );
}
