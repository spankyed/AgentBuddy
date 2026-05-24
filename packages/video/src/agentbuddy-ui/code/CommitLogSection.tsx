import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './CommitLogSection.module.css';

const styles = makeStyles('CommitLogSection');

export type CommitLogEntryState = {
  hash: string;
  time: string;
  title: string;
};

// Mirrors the lower CommitLogSection area inside packages/renderer/src/plugins/code/features/commit/CommitPanel.vue.
export function CommitLogSection({commits}: {commits: CommitLogEntryState[]}) {
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Icons.ChevronRight className={styles.chevron} size={13} />
          <span>COMMITS</span>
        </div>
        <button className={styles.iconButton} type="button" title="Refresh commits">
          <Icons.History size={14} />
        </button>
      </header>
      <div className={styles.list}>
        {commits.map(commit => (
          <div className={styles.row} key={commit.hash}>
            <Icons.GitCommit className={styles.commitIcon} size={13} />
            <div className={styles.copy}>
              <div className={styles.message}>{commit.title}</div>
              <div className={styles.meta}>{commit.hash} · {commit.time}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
