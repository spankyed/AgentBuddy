import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {notesShotViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './NotesShot.module.css';

const styles = makeStyles('NotesShot');

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesShotViewForFrame(frame);
  const layout = useAppWindowLayout({hasRightRail: frame > 178, variant});
  const taskListEnter = ease(frame, 190, 224);
  const appReveal = ease(frame, 78, 114);
  const renderLine = (line: {caretVisible?: boolean; text: string}) => (
    <>
      {line.text}
      <Caret frame={frame} visible={Boolean(line.caretVisible)} />
    </>
  );

  if (frame < 78) {
    const enter = ease(frame, 0, 24);
    const exit = ease(frame, 58, 78);
    return (
      <div className={`${styles.isolatedHome} ${variant === 'square' ? styles.square : ''}`}>
        <div
          className={styles.homeCard}
          style={{
            opacity: Math.min(enter, 1 - exit),
            transform: `translateY(${mix(18, 0, enter) - exit * 18}px) scale(${mix(0.985, 1, enter) - exit * 0.01})`,
          }}
        >
          <NotesHomeSurface
            favorites={view.home.favorites}
            greeting={view.home.greeting}
            recent={view.home.recent}
            searchQuery={view.home.searchQuery}
            searchResults={view.home.searchResults}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.appReveal}
      style={{
        opacity: appReveal,
        transform: `translateY(${mix(-26, 0, appReveal)}px) scale(${mix(0.986, 1, appReveal)})`,
      }}
    >
      <AppWindow
        activePlugin="notes"
        breadcrumbs={view.breadcrumbs}
        composer={view.composer}
        layout={layout}
        rightRail={frame > 178 ? <NotesRightRail state={view.rightRail} /> : undefined}
      >
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
      </AppWindow>
    </div>
  );
}
