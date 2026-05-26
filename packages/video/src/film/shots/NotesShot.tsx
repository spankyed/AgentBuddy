import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {notesShotViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesShotViewForFrame(frame);
  const layout = useAppWindowLayout({hasRightRail: frame > 178, variant});
  const taskListEnter = ease(frame, 190, 224);
  const renderLine = (line: {caretVisible?: boolean; text: string}) => (
    <>
      {line.text}
      <Caret frame={frame} visible={Boolean(line.caretVisible)} />
    </>
  );

  return (
    <AppWindow
      activePlugin="notes"
      breadcrumbs={view.breadcrumbs}
      composer={view.composer}
      layout={layout}
      rightRail={frame > 178 ? <NotesRightRail state={view.rightRail} /> : undefined}
    >
      {frame < 78 ? (
        <NotesHomeSurface
          favorites={view.home.favorites}
          greeting={view.home.greeting}
          recent={view.home.recent}
          searchQuery={view.home.searchQuery}
          searchResults={view.home.searchResults}
        />
      ) : (
        <NotesLayout
          showTaskList={frame > 190}
          taskListStyle={{
            opacity: taskListEnter,
            transform: `translateX(${mix(-36, 0, taskListEnter)}px)`,
          }}
          taskList={view.taskList}
          editor={{
            beforeLines: view.editor.beforeLines.map(renderLine),
            afterLines: view.editor.afterLines.map(renderLine),
            image: view.editor.image,
            title: view.editor.title,
          }}
        />
      )}
    </AppWindow>
  );
}
