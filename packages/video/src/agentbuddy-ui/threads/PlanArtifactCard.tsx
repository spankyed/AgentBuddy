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
            <Icons.Notes size={14} />
            <h3>{artifact.title}</h3>
          </div>
          <span className={styles.status}>{artifact.status}</span>
        </div>
        <div className={styles.body}>
          <ul>
            {artifact.notes.map(note => <li key={note}>{note}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

