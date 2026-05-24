import type {CodeReviewState} from '../../film/state/code';
import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import {CommitMessageBox} from './CommitMessageBox';
import {CodeDiffView} from './CodeDiffView';
import {CodePanelToolbar} from './CodePanelToolbar';
import {GitFileItem} from './GitFileItem';
import {BranchInfo} from './BranchInfo';
import {CommitLogSection} from './CommitLogSection';
import {WorktreesSection} from './WorktreesSection';
import './CodeReview.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('CodeReview');

type CodeReviewProps = {
  frame: number;
  state: CodeReviewState;
  variant?: 'landscape' | 'square';
};

export function CodeReview({frame, state, variant}: CodeReviewProps) {
  const message = frame > 116 ? state.generatedCommitMessage : '';
  return (
    <div className={cx(styles.root, variant === 'square' && styles.compact)}>
      <CodeDiffView fileName={state.diff.fileName} frame={frame} lineStart={state.diff.lineStart} lines={state.diff.lines} />
      <aside className={styles.panel}>
        <CodePanelToolbar branch={state.branch} changeCount={state.staged.length + state.changes.length} />
        <BranchInfo branch={state.branch} />
        <CommitMessageBox branch={state.branch} message={message} generating={frame > 76 && frame <= 116} />
        <div className={styles.fileGroups}>
          <section className={styles.fileGroup}>
            <div className={styles.groupHeader}><span>STAGED CHANGES</span><button><Icons.Minus size={12} /></button></div>
            {state.staged.map(file => <GitFileItem key={file.path} actions={['unstage']} file={file} selected />)}
          </section>
          <section className={styles.fileGroup}>
            <div className={styles.groupHeader}><span>CHANGES</span><div><button><Icons.RotateCcw size={12} /></button><button><Icons.Plus size={12} /></button></div></div>
            {state.changes.map((file, index) => <GitFileItem key={file.path} actions={['discard', 'stage']} file={file} selected={index === 0} />)}
          </section>
        </div>
        <CommitLogSection commits={state.commits} />
        <WorktreesSection worktrees={state.worktrees} />
      </aside>
    </div>
  );
}
