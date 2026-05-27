import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {Icons} from '../../agentbuddy-ui/primitives/Icon';
import {notesShotViewForFrame} from '../state/notes';
import {Caret} from './Caret';
import {Cursor} from '../overlays/Cursor';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './NotesShot.module.css';

const styles = makeStyles('NotesShot');
const EDITOR_FRAME_OFFSET = 132;

type NotesShotMode = 'open' | 'editor';

export function NotesShot({frame, mode = 'editor', variant}: {frame: number; mode?: NotesShotMode; variant?: 'landscape' | 'square'}) {
  if (mode === 'open') {
    return <NotesOpenShot frame={frame} variant={variant} />;
  }
  return <NotesEditorShot frame={frame} sourceFrame={frame + EDITOR_FRAME_OFFSET} variant={variant} />;
}

function NotesOpenShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const cursor = notesHomeCursorForFrame(frame);

  return (
    <div className={styles.root}>
      <AppWindow
        activePlugin="notes"
        breadcrumbs={['Notes']}
        layout={layout}
      >
        <NotesHomeSurface
          favorites={view.home.favorites}
          greeting={view.home.greeting}
          recent={view.home.recent}
          searchQuery={view.home.searchQuery}
          searchResults={view.home.searchResults}
        />
      </AppWindow>
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function NotesEditorShot({frame, sourceFrame, variant}: {frame: number; sourceFrame: number; variant?: 'landscape' | 'square'}) {
  const view = notesShotViewForFrame(sourceFrame);
  const layout = useAppWindowLayout({hasRightRail: sourceFrame > 204, variant});
  const taskListEnter = ease(sourceFrame, 210, 240);
  const cursor = notesEditorCursorForFrame(sourceFrame);
  const renderLine = (line: {caretVisible?: boolean; text: string}) => (
    <NoteLine frame={sourceFrame} line={line} />
  );
  const visibleLine = (line: {caretVisible?: boolean; text: string}) => line.text.length > 0 || Boolean(line.caretVisible);

  return (
    <div className={styles.root}>
      <AppWindow
        activePlugin="notes"
        breadcrumbs={view.breadcrumbs}
        composer={sourceFrame > 160 ? view.composer : false}
        layout={layout}
        rightRail={sourceFrame > 204 ? <NotesRightRail state={view.rightRail} /> : undefined}
      >
        <NotesLayout
          showTaskList={sourceFrame > 210}
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
      {cursor ? <Cursor frame={sourceFrame} {...cursor} /> : null}
    </div>
  );
}

function notesHomeCursorForFrame(frame: number) {
  if (frame >= 52 && frame < 88) {
    return {
      from: [55, 68] as [number, number],
      to: [32, 48] as [number, number],
      start: 52,
      end: 80,
    };
  }

  return null;
}

function notesEditorCursorForFrame(frame: number) {
  if (frame >= 150 && frame < 178) {
    return {
      from: [19, 31] as [number, number],
      to: [35, 31] as [number, number],
      start: 150,
      end: 170,
    };
  }

  if (frame >= 190 && frame < 222) {
    return {
      from: [58, 72] as [number, number],
      to: [78, 37] as [number, number],
      start: 190,
      end: 212,
    };
  }

  if (frame >= 222 && frame < 248) {
    return {
      from: [24, 43] as [number, number],
      to: [24, 23] as [number, number],
      start: 222,
      end: 238,
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
