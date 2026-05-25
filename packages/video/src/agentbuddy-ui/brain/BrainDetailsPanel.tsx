import {DataRenderer} from '../logs/DataRenderer';
import {Icons} from '../primitives/Icon';
import type {BrainNodeState} from './brainTypes';
import './BrainDetailsPanel.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('BrainDetailsPanel');

export function BrainDetailsPanel({node}: {node?: BrainNodeState}) {
  if (!node) return null;
  const {result, ...input} = node.nodeAttributes ?? {};
  const hasInput = Object.keys(input).length > 0;
  const hasOutput = result !== undefined;
  const hasContent = hasInput || hasOutput;
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.title}>{node.label}</div>
          {node.status ? <span className={styles.status} data-status={node.status}>{node.status}</span> : null}
          {node.eventType ? <span className={styles.eventType}>{node.eventType}</span> : <span className={styles.kind}>{node.kind}</span>}
        </div>
        <button className={styles.closeButton} type="button" aria-label="Close details">
          <Icons.X size={18} />
        </button>
      </header>
      <div className={styles.body}>
        <div className={styles.content}>
        {hasInput ? (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Input Parameters</div>
            <div className={styles.dataBlock}>
              <DataRenderer data={input} hideExpand />
            </div>
          </section>
        ) : null}
        {hasOutput ? (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Output Result</div>
            <div className={styles.dataBlock}>
              <DataRenderer data={result} hideExpand />
            </div>
          </section>
        ) : null}
        {!hasContent && !node.startedAt ? (
          <div className={styles.empty}>{node.status === 'active' ? 'Step is currently executing...' : 'No additional details available'}</div>
        ) : null}
        </div>
      </div>
      {node.startedAt ? (
        <footer className={styles.footer}>
          <div className={styles.sectionTitle}>Execution Info</div>
          <div className={styles.info}>
            <span><span className={styles.label}>Started:</span> {node.startedAt}</span>
          </div>
        </footer>
      ) : null}
    </aside>
  );
}
