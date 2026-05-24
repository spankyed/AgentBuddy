import {ease, mix} from '../../film/state/timeline';
import {ThreadCard} from '../threads/ThreadCard';
import './CodeReview.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('CodeReview');

export function CodeReview({frame}: {frame: number}) {
  const files = ['src/demo/timeline.ts', 'src/ui/AppShell.tsx', 'src/shots/Workflow.tsx'];
  const lines = [
    ['+', 'export const launchMoments = createTimeline({'],
    ['+', '  chat: streamConversation(becomesWork),'],
    ['+', '  code: generateCommitAndPullRequest(),'],
    ['-', '  screenshots: panAcrossStaticFrames(),'],
    ['+', '  workflow: activateReleaseAutomation(),'],
    ['+', '});'],
  ];
  return (
    <div className={styles.root}>
      <aside className={styles.panel}>
        <div className={styles.label}>Changed files</div>
        {files.map((file, index) => <div key={file} className={index === 1 ? styles.activeFile : styles.file}>{file}</div>)}
      </aside>
      <section className={styles.diff}>
        <header className={styles.diffHead}><span>AppShell.tsx</span><small>{Math.round(mix(0, 6, ease(frame, 58, 132)))} changes</small></header>
        {lines.map(([kind, line], index) => (
          <pre key={line} className={kind === '+' ? styles.add : styles.remove} style={{opacity: ease(frame, 46 + index * 15, 64 + index * 15)}}>{kind} {line}</pre>
        ))}
        <ThreadCard className={styles.commit} style={{opacity: ease(frame, 178, 220)}}>
          <small className={styles.label}>Generated commit</small>
          <strong>feat(video): build Remotion-native launch film</strong>
        </ThreadCard>
      </section>
      <aside className={styles.ship}>
        {['branch published', 'checks passed', 'PR created'].map((item, index) => <div key={item} className={styles.shipRow} style={{opacity: ease(frame, 216 + index * 22, 236 + index * 22)}}>{item}</div>)}
      </aside>
    </div>
  );
}

