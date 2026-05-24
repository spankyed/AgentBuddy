import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './CommitLogSection.module.css';

const styles = makeStyles('CommitLogSection');

const commits = [
  {hash: '9f42c8a', title: 'Improve launch film code surface', time: '2m ago'},
  {hash: '77bb1e4', title: 'Align tasklist rows with renderer', time: '18m ago'},
  {hash: '43d0ac9', title: 'Add Remotion app chrome primitives', time: '1h ago'},
];

// Mirrors the lower CommitLogSection area inside packages/renderer/src/plugins/code/features/commit/CommitPanel.vue.
export function CommitLogSection() {
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
