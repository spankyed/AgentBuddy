import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {PullRequestPanelState} from './codeTypes';
import './PRInfo.module.css';

const styles = makeStyles('PRInfo');

export function PRInfo({state}: {state: PullRequestPanelState}) {
  const pr = state.createdPr;
  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.state}>{pr?.state ?? 'OPEN'}</span>
          <h3>{state.title}</h3>
        </div>
        <span className={styles.number}>#{pr?.number}</span>
      </div>
      <div className={styles.body}>{state.body}</div>
      <div className={styles.checks}>
        {state.checks.map(check => <div className={styles.check} key={check}><Icons.CircleCheck size={12} /><span>{check}</span></div>)}
      </div>
    </section>
  );
}
