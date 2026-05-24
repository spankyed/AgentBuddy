import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {PullRequestPanelState} from './codeTypes';
import './PRSelector.module.css';

const styles = makeStyles('PRSelector');

export function PRSelector({state}: {state: PullRequestPanelState}) {
  const created = state.createdPr;
  return (
    <div className={styles.root}>
      <button className={styles.button} type="button">
        <Icons.PullRequest size={12} />
        <span className={created ? undefined : styles.placeholder}>
          {created ? `#${created.number} ${state.title}` : 'Select a pull request...'}
        </span>
        {created ? <span className={styles.state}>{created.state}</span> : null}
      </button>
    </div>
  );
}
