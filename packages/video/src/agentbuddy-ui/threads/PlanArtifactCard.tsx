import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {PlanArtifactState} from './threadTypes';
import './PlanArtifactCard.module.css';

const styles = makeStyles('PlanArtifactCard');

// Mirrors packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/plan-artifact.vue.
export function PlanArtifactCard({artifact}: {artifact: PlanArtifactState}) {
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <Icons.ClipboardList className={styles.artifactIcon} size={14} />
            <h3>{artifact.title || 'Plan'}</h3>
            {artifact.branch ? <span className={styles.branch}>{artifact.branch}</span> : null}
            {artifact.prNumber ? <span className={styles.prNumber}>#{artifact.prNumber}</span> : null}
          </div>
          <div className={styles.headerActions}>
            <button className={styles.copyButton} type="button" aria-label="Copy plan notes"><Icons.Copy size={14} /></button>
            <span className={styles.status} data-status={artifact.status}>{statusLabel(artifact.status)}</span>
          </div>
        </div>
        <div className={styles.body}>
          {artifact.notes ? <MarkdownNotes notes={artifact.notes} /> : <p className={styles.empty}>This plan has no notes yet.</p>}
        </div>
      </div>
    </div>
  );
}

function MarkdownNotes({notes}: {notes: string}) {
  const lines = notes.split('\n').filter(Boolean);
  const allList = lines.every(line => line.trim().startsWith('- '));
  if (allList) {
    return <ul>{lines.map(line => <li key={line}>{line.trim().slice(2)}</li>)}</ul>;
  }
  return <>{lines.map(line => <p key={line}>{line}</p>)}</>;
}

function statusLabel(status: PlanArtifactState['status']) {
  if (status === 'in-progress') return 'In progress';
  if (status === 'approved') return 'Approved';
  if (status === 'completed') return 'Completed';
  return 'Draft';
}
