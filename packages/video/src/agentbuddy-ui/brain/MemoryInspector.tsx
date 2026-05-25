import {makeStyles} from '../primitives/makeStyles';
import type {BrainSurfaceState} from './brainTypes';
import './MemoryInspector.module.css';

const styles = makeStyles('MemoryInspector');

export function MemoryInspector({state}: {state: BrainSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>{state.selectedMemory.title}</header>
      <section className={styles.section}>
        <div className={styles.label}>Facts</div>
        {state.selectedMemory.facts.map(fact => <p key={fact} className={styles.fact}>{fact}</p>)}
      </section>
      <section className={styles.section}>
        <div className={styles.label}>Recent traces</div>
        {state.traces.map(trace => (
          <div key={trace.id} className={styles.trace}>
            <div>{trace.summary}</div>
            <div className={styles.meta}>{trace.time} · {trace.tokens}</div>
          </div>
        ))}
      </section>
    </aside>
  );
}
