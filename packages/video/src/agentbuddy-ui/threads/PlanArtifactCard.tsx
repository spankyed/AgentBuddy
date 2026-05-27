import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {PlanArtifactState} from './threadTypes';
import {MarkdownViewer} from './MarkdownViewer';
import './PlanArtifactCard.module.css';

const styles = makeStyles('PlanArtifactCard');

// Mirrors packages/renderer/src/plugins/threads/canvas/agent/artifacts/types/plan-artifact.vue.
export function PlanArtifactCard({artifact}: {artifact: PlanArtifactState}) {
  const branch = artifact.content.branch ?? '';
  const notes = artifact.content.notes ?? '';
  const prNumber = artifact.content.prNumber ?? '';
  const steps = artifact.content.steps ?? [];
  const status = artifact.content.status ?? 'draft';
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <Icons.ClipboardList className={styles.artifactIcon} size={14} />
            <h3>{artifact.title || 'Plan'}</h3>
            {branch ? <span className={styles.branch}>{branch}</span> : null}
            {prNumber ? <span className={styles.prNumber}>#{prNumber}</span> : null}
          </div>
          <div className={styles.headerActions}>
            <button className={styles.copyButton} type="button" aria-label="Copy plan notes"><Icons.Copy size={14} /></button>
            <span className={styles.status} data-status={status}>{statusLabel(status)}</span>
          </div>
        </div>
        <div className={styles.body}>
          {steps.length > 0 ? (
            <StructuredPlan artifact={artifact} />
          ) : notes ? (
            <MarkdownViewer content={notes} />
          ) : (
            <p className={styles.empty}>This plan has no notes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StructuredPlan({artifact}: {artifact: PlanArtifactState}) {
  const steps = artifact.content.steps ?? [];
  const nextStep = artifact.content.nextStep ?? 'Review release checklist';
  return (
    <div className={styles.structured}>
      <section className={styles.section}>
        <h4>Launch path</h4>
        <div className={styles.stepList}>
          {steps.map(step => (
            <div className={styles.stepRow} data-status={step.status} key={step.id}>
              <span className={styles.stepCheck}>{step.status === 'done' ? <Icons.Check size={12} /> : null}</span>
              <div className={styles.stepCopy}>
                <span>{step.title}</span>
                {step.description ? <small>{step.description}</small> : null}
              </div>
              <small>{stepStatusLabel(step.status)}</small>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.section}>
        <h4>Surface state</h4>
        <div className={styles.stateGrid}>
          <span>Thread plan</span>
          <strong>active</strong>
          <span>Parent ticket</span>
          <strong>linked</strong>
          <span>Next step</span>
          <strong>{nextStep}</strong>
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: PlanArtifactState['content']['status']) {
  if (status === 'in-progress') return 'In progress';
  if (status === 'approved') return 'Approved';
  if (status === 'completed') return 'Completed';
  if (status === 'rejected') return 'Rejected';
  return 'Draft';
}

function stepStatusLabel(status: string) {
  if (status === 'done') return 'done';
  if (status === 'running') return 'running';
  if (status === 'blocked') return 'blocked';
  return status;
}
