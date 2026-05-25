import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {PullRequestPanelState} from './codeTypes';
import './PRActionBar.module.css';

const styles = makeStyles('PRActionBar');

export function PRActionBar({state}: {state: PullRequestPanelState}) {
  const pr = state.createdPr;
  if (pr && (pr.state === 'MERGED' || pr.state === 'CLOSED')) {
    return (
      <div className={styles.root}>
        <button className={styles.checkout} type="button"><Icons.GitBranch size={11} /><span>Checkout & Pull Base</span></button>
        <span className={styles.spacer} />
        <button className={styles.deleteBranch} type="button"><Icons.Trash2 size={11} /><span>Delete Branch</span></button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.mergeGroup}>
        <button className={styles.merge} type="button"><Icons.GitMerge size={11} /><span>Merge</span></button>
        <button className={styles.chevron} type="button"><Icons.ChevronDown size={11} /></button>
      </div>
      <button className={styles.draft} type="button"><Icons.FileEdit size={11} /><span>Draft</span></button>
      <span className={styles.spacer} />
      <button className={styles.close} type="button"><Icons.CircleX size={11} /><span>Close</span></button>
    </div>
  );
}
