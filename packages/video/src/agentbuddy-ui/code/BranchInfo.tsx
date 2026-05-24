import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './BranchInfo.module.css';

const styles = makeStyles('BranchInfo');

export function BranchInfo({branch}: {branch: string}) {
  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <div className={styles.field}>
          <Icons.GitBranch className={styles.branchIcon} size={12} />
          <input className={styles.input} readOnly value={branch} />
          <Icons.ChevronRight className={styles.chevron} size={14} />
        </div>
        <button className={styles.button} title="Create new branch" type="button">
          <Icons.GitBranchPlus size={14} />
        </button>
      </div>
    </div>
  );
}
