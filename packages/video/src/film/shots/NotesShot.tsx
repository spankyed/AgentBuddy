import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {Icons} from '../../agentbuddy-ui/primitives/Icon';
import {notesEditorViewForFrame, notesHomeViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import {Cursor} from '../overlays/Cursor';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './NotesShot.module.css';

const styles = makeStyles('NotesShot');

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  if (frame < 124) {
    return <NotesOpenShot frame={frame} variant={variant} />;
  }
  return <NotesEditorShot frame={frame - 124} variant={variant} />;
}

function NotesOpenShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const home = notesHomeViewForFrame(frame);
  const baseLayout = useAppWindowLayout({animate: false, variant});
  const chromeReveal = ease(frame, 96, 120);
  const layout = {
    ...baseLayout,
    windowStyle: {
      ...baseLayout.windowStyle,
      opacity: 1,
    },
  };
  const cursor = notesHomeCursorForFrame(frame);
  const surfaceBackground = `rgb(23 23 23 / ${chromeReveal})`;

  return (
    <div className={styles.root}>
      <AppWindow
        activePlugin="notes"
        breadcrumbs={['Notes']}
        chromeOpacity={chromeReveal}
        frameOpacity={chromeReveal}
        headerOpacity={chromeReveal}
        layout={layout}
        mainBackground={surfaceBackground}
        surfaceBackground={surfaceBackground}
      >
        <NotesHomeSurface
          favorites={home.favorites}
          greeting={home.greeting}
          newNotePressed={home.newNotePressed}
          recent={home.recent}
          searchQuery={home.searchQuery}
          searchResults={home.searchResults}
          showFavorites={home.showFavorites}
          showRecent={home.showRecent}
          showSearch={home.showSearch}
          style={{background: 'transparent'}}
        />
      </AppWindow>
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function NotesEditorShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesEditorViewForFrame(frame);
  const taskListVisible = frame >= 88;
  const layout = useAppWindowLayout({animate: false, hasRightRail: true, variant});
  const taskListEnter = ease(frame, 88, 112);
  const cursor = notesEditorCursorForFrame(frame);
  const renderLine = (line: {caretVisible?: boolean; text: string}) => (
    <NoteLine frame={frame} line={line} />
  );
  const visibleLine = (line: {caretVisible?: boolean; text: string}) => line.text.length > 0 || Boolean(line.caretVisible);

  return (
    <div className={styles.root}>
      <AppWindow
        activePlugin="notes"
        breadcrumbs={view.breadcrumbs}
        composer={false}
        layout={layout}
        rightRail={<NotesRightRail state={view.rightRail} />}
      >
        <NotesLayout
          showTaskList={taskListVisible}
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
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function notesHomeCursorForFrame(frame: number) {
  if (frame >= 88 && frame < 126) {
    return {
      from: [50, 58] as [number, number],
      to: [67, 28] as [number, number],
      start: 88,
      end: 116,
    };
  }

  return null;
}

function notesEditorCursorForFrame(frame: number) {
  if (frame >= 62 && frame < 92) {
    return {
      from: [55, 52] as [number, number],
      to: [83, 38] as [number, number],
      start: 62,
      end: 82,
    };
  }

  if (frame >= 120 && frame < 150) {
    return {
      from: [35, 42] as [number, number],
      to: [17, 29] as [number, number],
      start: 120,
      end: 140,
    };
  }

  if (frame >= 158 && frame < 184) {
    return {
      from: [18, 29] as [number, number],
      to: [32, 29] as [number, number],
      start: 158,
      end: 174,
    };
  }

  return null;
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
  if (referenceAndAfter.length < fullTitle.length) {
    return (
      <>
        {line.text}
        <Caret frame={frame} visible={Boolean(line.caretVisible)} />
      </>
    );
  }

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
