import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {Icons} from '../../agentbuddy-ui/primitives/Icon';
import {ComponentStage} from '../ComponentStage';
import {notesShotViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './NotesShot.module.css';

const styles = makeStyles('NotesShot');

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesShotViewForFrame(frame);
  const layout = useAppWindowLayout({hasRightRail: frame > 170, variant});
  const taskListEnter = ease(frame, 176, 206);
  const appReveal = ease(frame, 0, 36);
  const renderLine = (line: {caretVisible?: boolean; text: string}) => (
    <NoteLine frame={frame} line={line} />
  );
  const visibleLine = (line: {caretVisible?: boolean; text: string}) => line.text.length > 0 || Boolean(line.caretVisible);

  if (frame < 78) {
    const homeExit = ease(frame, 58, 78);
    return (
      <ComponentStage
        frame={frame}
        height={variant === 'square' ? 'min(620px, calc(100% - 112px))' : 'min(560px, calc(100% - 180px))'}
        variant={variant}
        width={variant === 'square' ? 'min(680px, calc(100% - 96px))' : 'min(760px, calc(100% - 180px))'}
      >
        <NotesHomeSurface
          favorites={view.home.favorites}
          greeting={view.home.greeting}
          recent={view.home.recent}
          searchQuery={view.home.searchQuery}
          searchResults={view.home.searchResults}
        />
        <div
          className={styles.homeFade}
          style={{
            opacity: homeExit,
          }}
        />
      </ComponentStage>
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
        rightRail={frame > 170 ? <NotesRightRail state={view.rightRail} /> : undefined}
      >
        <NotesLayout
          showTaskList={frame > 176}
          taskListStyle={{
            opacity: taskListEnter,
            transform: `translateX(${mix(-36, 0, taskListEnter)}px)`,
          }}
          taskList={view.taskList}
          editor={{
            beforeLines: view.editor.beforeLines.filter(visibleLine).map(renderLine),
            afterLines: view.editor.afterLines.filter(visibleLine).map(renderLine),
            image: view.editor.image,
            title: view.editor.title,
          }}
        />
      </AppWindow>
    </div>
  );
}

function NoteLine({frame, line}: {frame: number; line: {caretVisible?: boolean; text: string}}) {
  const marker = '#threads: ';
  const markerIndex = line.text.indexOf(marker);
  if (markerIndex === -1) {
    return (
      <>
        {line.text}
        <Caret frame={frame} visible={Boolean(line.caretVisible)} />
      </>
    );
  }

  const before = line.text.slice(0, markerIndex);
  const referenceAndAfter = line.text.slice(markerIndex + marker.length);
  const fullTitle = 'Create launch PR flow';
  const title = referenceAndAfter.slice(0, Math.min(fullTitle.length, referenceAndAfter.length));
  const shownSuffix = referenceAndAfter.length > fullTitle.length ? referenceAndAfter.slice(fullTitle.length) : '';

  return (
    <>
      {before}
      <span className={styles.threadPill}>
        <Icons.MessageSquare size={13} />
        <span>{title}</span>
      </span>
      {shownSuffix}
      <Caret frame={frame} visible={Boolean(line.caretVisible)} />
    </>
  );
}
