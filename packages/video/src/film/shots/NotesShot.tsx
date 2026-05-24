import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {launchComposerState} from '../state/chat';
import {notesEditorCopy, notesRightRailState, notesTaskListState, notesViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';

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
      <NotesLayout
        taskList={{
          activeId: notesTaskListState.activeId,
          items: notesTaskListState.items,
          showCompleted: notesTaskListState.showCompleted,
          title: notesTaskListState.title,
        }}
        editor={{
          beforeLines: [...notesEditorCopy.beforeLines, <>{view.lines[0]}<Caret frame={frame} visible={view.carets[0].visible} /></>],
          afterLines: [view.lines[1], <>{view.lines[2]}<Caret frame={frame} visible={view.carets[2].visible} /></>],
          title: notesEditorCopy.title,
        }}
      />
    </AppWindow>
  );
}
