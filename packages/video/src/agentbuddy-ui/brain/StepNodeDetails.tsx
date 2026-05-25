import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {BrainNode} from './brainTypes';
import './BrainSurface.module.css';

const styles = makeStyles('BrainSurface');

export function StepNodeDetails({node}: {node: BrainNode}) {
  return (
    <aside className={styles.details} data-onboarding-id="brain-step-details">
      <header className={styles.detailsHeader}>
        <div className={styles.detailsTitle}>
          <h3 title={node.label}>{node.label}</h3>
          <span className={styles.detailsMeta}>{node.status} {node.stepNodeType ? <b>{node.stepNodeType}</b> : null}{node.eventType ? <code>{node.eventType}</code> : null}</span>
        </div>
        <button><Icons.X size={18} /></button>
      </header>
      <div className={styles.detailsBody}>
        {node.nodeAttributes ? <DataSection title="Input Parameters" data={node.nodeAttributes} /> : null}
        {node.output ? <DataSection title="Output Result" data={node.output} /> : null}
        {!node.nodeAttributes && !node.output ? <div className={styles.noDetails}>{node.status === 'active' ? 'Step is currently executing...' : 'No additional details available'}</div> : null}
      </div>
      {(node.startedAt || node.duration) ? (
        <footer className={styles.execution}>
          <h4>Execution Info</h4>
          <div>
            {node.startedAt ? <span>Started: <b>{node.startedAt}</b></span> : null}
            {node.duration ? <span>Duration: <b>{node.duration}</b></span> : null}
          </div>
        </footer>
      ) : null}
    </aside>
  );
}

function DataSection({title, data}: {title: string; data: unknown}) {
  return <section className={styles.dataSection}><h4>{title}</h4><pre>{JSON.stringify(data, null, 2)}</pre></section>;
}
