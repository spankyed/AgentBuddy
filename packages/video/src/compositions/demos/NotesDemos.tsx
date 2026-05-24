import {useCurrentFrame} from 'remotion';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {TaskListPanel} from '../../agentbuddy-ui/notes/TaskListPanel';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {NotesShot} from '../../film/shots/NotesShot';
import {notesEditorCopy, notesRightRailSearchState, notesRightRailState, notesTaskListItems} from '../../film/state/notes';
import {DemoPanelSlot} from '../DemoLayout';

export const TaskListPanelDemo = () => (
  <SurfaceFrame>
    <DemoPanelSlot>
      <TaskListPanel items={notesTaskListItems} title={notesEditorCopy.panelTitle} />
    </DemoPanelSlot>
  </SurfaceFrame>
);

export const NotesRightRailDemo = () => (
  <SurfaceFrame>
    <DemoPanelSlot side="right" width={368}>
      <NotesRightRail state={notesRightRailState} />
    </DemoPanelSlot>
  </SurfaceFrame>
);

export const NotesRightRailSearchDemo = () => (
  <SurfaceFrame>
    <DemoPanelSlot side="right" width={368}>
      <NotesRightRail state={notesRightRailSearchState} />
    </DemoPanelSlot>
  </SurfaceFrame>
);

export const NotesSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <NotesShot frame={frame} />
    </SurfaceFrame>
  );
};
