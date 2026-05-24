import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NoteEditor} from '../../agentbuddy-ui/notes/NoteEditor';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {TaskListPanel} from '../../agentbuddy-ui/notes/TaskListPanel';
import {notesEditorCopy, notesRailFavorites, notesRailTree, notesTaskListItems} from '../state/notes';
import {textReveal} from '../state/timeline';
import {Caret} from './Caret';
import './NotesShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('NotesShot');

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const [lineAText, lineBText, lineCText] = notesEditorCopy.animatedLines;
  const lineA = textReveal(lineAText, frame, 34, 112);
  const lineB = textReveal(lineBText, frame, 128, 198);
  const lineC = textReveal(lineCText, frame, 168, 238);
  return (
    <AppWindow
      activePlugin="notes"
      variant={variant}
      breadcrumbs={notesEditorCopy.breadcrumbs}
      rightRail={<NotesRightRail favorites={notesRailFavorites} items={notesRailTree} />}
    >
      <div className={styles.root}>
        <TaskListPanel items={notesTaskListItems} />
        <NoteEditor
          beforeLines={[...notesEditorCopy.beforeLines, <>{lineA}<Caret frame={frame} visible={frame < 116} /></>]}
          afterLines={[lineB, <>{lineC}<Caret frame={frame} visible={frame > 168 && frame < 242} /></>]}
        />
      </div>
    </AppWindow>
  );
}
