import {ease} from '../../film/state/timeline';
import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import './CodeDiffView.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('CodeDiffView');

const lines = [
  [' ', 'export async function prepareLaunchPlan(context) {'],
  ['+', '  const notes = await memory.collectLinkedNotes(context);'],
  ['+', '  const tickets = await threads.createExecutionTickets(notes);'],
  ['-', '  await handoff.writeChecklist(tickets);'],
  ['+', '  await workflows.scheduleReleaseChecks(tickets);'],
  [' ', '}'],
] as const;

export function CodeDiffView({frame}: {frame: number}) {
  return (
    <section className={styles.root}>
      <div className={styles.tabs}>
        <div className={styles.tab}><Icons.File size={13} /> AgentBuddyFilm.tsx</div>
      </div>
      <div className={styles.editor}>
        {lines.map(([kind, text], index) => (
          <div
            key={`${kind}-${text}`}
            className={cx(styles.line, kind === '+' && styles.add, kind === '-' && styles.remove)}
            style={{opacity: kind === ' ' ? 1 : ease(frame, 42 + index * 12, 60 + index * 12)}}
          >
            <span className={styles.number}>{index + 24}</span>
            <span className={styles.code}>{kind} {text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
