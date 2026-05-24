import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NoteEditor} from '../../agentbuddy-ui/notes/NoteEditor';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {TaskListPanel} from '../../agentbuddy-ui/notes/TaskListPanel';
import {launchComposerState} from '../state/chat';
import {notesEditorCopy, notesRightRailState, notesTaskListItems, notesViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import './NotesShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import {useAppWindowLayout} from '../appWindowLayout';
const styles = makeStyles('NotesShot');

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesViewForFrame(frame);
  const layout = useAppWindowLayout({hasRightRail: true, variant});
  return (
    <AppWindow
      activePlugin="notes"
      breadcrumbs={notesEditorCopy.breadcrumbs}
      composer={launchComposerState}
      layout={layout}
      rightRail={<NotesRightRail state={notesRightRailState} />}
    >
      <div className={styles.root}>
        <TaskListPanel items={notesTaskListItems} title={notesEditorCopy.panelTitle} />
        <NoteEditor
          beforeLines={[...notesEditorCopy.beforeLines, <>{view.lines[0]}<Caret frame={frame} visible={view.carets[0].visible} /></>]}
          afterLines={[view.lines[1], <>{view.lines[2]}<Caret frame={frame} visible={view.carets[2].visible} /></>]}
          title={notesEditorCopy.title}
        />
      </div>
    </AppWindow>
  );
}
