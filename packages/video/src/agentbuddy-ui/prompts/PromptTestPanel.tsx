import {makeStyles} from '../primitives/makeStyles';
import type {PromptSurfaceState} from './promptTypes';
import './PromptTestPanel.module.css';

const styles = makeStyles('PromptTestPanel');

export function PromptTestPanel({state}: {state: PromptSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>Test Prompt</header>
      <section className={styles.section}>
        <div className={styles.label}>Variables</div>
        {state.variables.map(variable => (
          <div key={variable.key} className={styles.variable}>
            <span>{variable.key}</span>
            <span className={styles.value}>{variable.value}</span>
          </div>
        ))}
      </section>
      <section className={styles.section}>
        <div className={styles.label}>Output</div>
        <div className={styles.output}>
          {state.testOutput.map(line => <p key={line}>{line}</p>)}
        </div>
      </section>
    </aside>
  );
}
