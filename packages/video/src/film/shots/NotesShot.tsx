import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NoteEditor} from '../../agentbuddy-ui/notes/NoteEditor';
import {NotesPanel} from '../../agentbuddy-ui/notes/NotesPanel';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {textReveal} from '../state/timeline';
import {Caret} from './Caret';
import styles from './NotesShot.module.css';

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const lineA = textReveal('demo different features with cinematic product scenes', frame, 34, 112);
  const lineB = textReveal('conversation becomes tickets, notes, code, and workflows', frame, 128, 198);
  const lineC = textReveal('same surface, same memory, no context handoff', frame, 168, 238);
  return (
    <AppWindow activePlugin="notes" variant={variant} breadcrumbs={['Notes', 'AgentBuddy', 'Tasklist', 'Current']} title="Notes" rightRail={<NotesRightRail />}>
      <div className={styles.root}>
        <NotesPanel />
        <NoteEditor
          path="Notes › 🚀 AgentBuddy › 📝 Tasklist › 🔥 Current"
          beforeLines={['provocative posts', '3 clips a week for clientlabs yt', <>{lineA}<Caret frame={frame} visible={frame < 116} /></>]}
          afterLines={[lineB, <>{lineC}<Caret frame={frame} visible={frame > 168 && frame < 242} /></>]}
        />
      </div>
    </AppWindow>
  );
}

