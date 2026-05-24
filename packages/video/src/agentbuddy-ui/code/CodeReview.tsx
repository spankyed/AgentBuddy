import {ease} from '../../film/state/timeline';
import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import {CommitMessageBox} from './CommitMessageBox';
import {CodeDiffView} from './CodeDiffView';
import {CodePanelToolbar} from './CodePanelToolbar';
import {GitFileItem, type GitFile} from './GitFileItem';
import {BranchInfo} from './BranchInfo';
import {CommitLogSection} from './CommitLogSection';
import {WorktreesSection} from './WorktreesSection';
import './CodeReview.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('CodeReview');

export function CodeReview({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const staged: GitFile[] = [{path: 'packages/video/src/film/AgentBuddyFilm.tsx', status: 'modified'}];
  const changes: GitFile[] = [
    {path: 'packages/video/src/agentbuddy-ui/threads/KanbanBoard.tsx', status: 'modified'},
    {path: 'packages/video/src/agentbuddy-ui/code/CodeDiffView.tsx', status: 'added'},
    {path: 'packages/video/src/film/state/timeline.ts', status: 'modified'},
  ];
  const message = frame > 116 ? 'feat(video): align launch film surfaces with app UI' : '';
  return (
    <div className={cx(styles.root, variant === 'square' && styles.compact)}>
      <aside className={styles.panel}>
        <CodePanelToolbar />
        <BranchInfo branch="as/react-launch-film" />
        <CommitMessageBox message={message} generating={frame > 76 && frame <= 116} />
        <div className={styles.fileGroups}>
          <section className={styles.fileGroup}>
            <div className={styles.groupHeader}><span>STAGED CHANGES</span><button><Icons.Minus size={12} /></button></div>
            {staged.map(file => <GitFileItem key={file.path} actions={['unstage']} file={file} selected />)}
          </section>
          <section className={styles.fileGroup}>
            <div className={styles.groupHeader}><span>CHANGES</span><div><button><Icons.RotateCcw size={12} /></button><button><Icons.Plus size={12} /></button></div></div>
            {changes.map((file, index) => <GitFileItem key={file.path} actions={['discard', 'stage']} file={file} selected={index === 0} />)}
          </section>
        </div>
        <CommitLogSection />
        <WorktreesSection />
      </aside>
      <CodeDiffView frame={frame} />
      <aside className={styles.prPanel}>
        <div className={styles.prHeader}>Pull Request</div>
        {['Branch published', 'Checks passed', 'PR ready'].map((item, index) => (
          <div key={item} className={styles.prRow} style={{opacity: ease(frame, 178 + index * 22, 196 + index * 22)}}><Icons.CircleCheck size={14} />{item}</div>
        ))}
      </aside>
    </div>
  );
}
