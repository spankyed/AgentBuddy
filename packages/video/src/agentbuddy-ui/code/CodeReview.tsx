import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import type {CodeReviewState, CodeReviewViewState} from './codeTypes';
import {CommitMessageBox} from './CommitMessageBox';
import {CodeDiffView} from './CodeDiffView';
import {CodePanelToolbar} from './CodePanelToolbar';
import {GitFileItem} from './GitFileItem';
import {BranchInfo} from './BranchInfo';
import {CommitLogSection} from './CommitLogSection';
import {WorktreesSection} from './WorktreesSection';
import {TerminalPanelSection} from './TerminalPanelSection';
import {PullRequestPanel} from './PullRequestPanel';
import './CodeReview.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('CodeReview');

type CodeReviewProps = {
  state: CodeReviewState;
  variant?: 'landscape' | 'square';
  view: CodeReviewViewState;
};

export function CodeReview({state, variant, view}: CodeReviewProps) {
  return (
    <div className={cx(styles.root, variant === 'square' && styles.compact)}>
      <CodeDiffView fileName={state.diff.fileName} lineOpacities={view.diffLineOpacities} lineStart={state.diff.lineStart} lines={state.diff.lines} />
      <aside className={styles.panel}>
        {view.activePanel === 'pr' ? (
          <PullRequestPanel
            baseDirectory={state.baseDirectory}
            changeCount={state.staged.length + state.changes.length}
            mode={view.prMode}
            publishProgress={view.prPublishProgress}
            state={{
              ...state.pullRequest,
              branchPublished: view.prPublishProgress >= 1,
              createdPr: view.prCreated ? state.pullRequest.createdPr : undefined,
            }}
          />
        ) : (
          <div className={styles.panelContent}>
            <CodePanelToolbar baseDirectory={state.baseDirectory} changeCount={state.staged.length + state.changes.length} />
            <BranchInfo branch={state.branch} />
            <CommitMessageBox branch={state.branch} message={view.commitMessage} generating={view.generatingCommitMessage} />
            <div className={styles.fileGroups}>
              <section className={styles.fileGroup}>
                <div className={styles.groupHeader}><span>STAGED CHANGES</span><button><Icons.Minus size={13} /></button></div>
                {state.staged.map(file => <GitFileItem key={file.path} actions={['unstage']} file={file} selected />)}
              </section>
              <section className={styles.fileGroup}>
                <div className={styles.groupHeader}><span>CHANGES</span><div><button><Icons.RotateCcw size={13} /></button><button><Icons.Plus size={13} /></button></div></div>
                {state.changes.map((file, index) => <GitFileItem key={file.path} actions={['discard', 'stage']} file={file} selected={index === 0} />)}
              </section>
            </div>
            <CommitLogSection commits={state.commits} />
            <WorktreesSection worktrees={state.worktrees} />
          </div>
        )}
        <TerminalPanelSection state={state.terminal} />
      </aside>
    </div>
  );
}
