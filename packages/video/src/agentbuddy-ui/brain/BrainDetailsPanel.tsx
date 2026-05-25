import type {BrainNodeState} from './brainTypes';
import './BrainDetailsPanel.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('BrainDetailsPanel');

function format(value: unknown) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function BrainDetailsPanel({node}: {node?: BrainNodeState}) {
  if (!node) return null;
  const {result, ...input} = node.nodeAttributes ?? {};
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>{node.label}</div>
        <div className={styles.meta}>
          {node.status ? <span className={styles.status} data-status={node.status}>{node.status}</span> : null}
          <span>{node.kind}</span>
        </div>
      </header>
      <div className={styles.body}>
        {Object.keys(input).length ? (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Input Parameters</div>
            <pre className={styles.block}>{format(input)}</pre>
          </section>
        ) : null}
        {result ? (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Output Result</div>
            <pre className={styles.block}>{format(result)}</pre>
          </section>
        ) : null}
      </div>
      <footer className={styles.footer}>
        <div className={styles.info}>
          <span><span className={styles.label}>Started:</span> {node.startedAt ?? 'pending'}</span>
        </div>
      </footer>
    </aside>
  );
}
