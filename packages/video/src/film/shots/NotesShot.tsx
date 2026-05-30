import type {ReactNode} from 'react';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../agentbuddy-ui/notes/NotesRightRail';
import {ReferencePill} from '../../agentbuddy-ui/chat/ReferencePill';
import {TextCaret} from '../../agentbuddy-ui/primitives/TextCaret';
import {notesEditorViewForFrame, notesHomeViewForFrame, type NotesEditorLineView} from '../state/notes';
import {Cursor} from '../overlays/Cursor';
import {cursorMove, percentTarget} from '../interaction/cursorTargets';
import type {CursorPath, TargetRect} from '../interaction/cursorTargets';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './NotesShot.module.css';

const styles = makeStyles('NotesShot');
const notesHomeDuration = 156;

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  if (frame < notesHomeDuration) {
    return <NotesOpenShot frame={frame} variant={variant} />;
  }
  return <NotesEditorShot frame={frame - notesHomeDuration} variant={variant} />;
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
  const editorEnter = ease(frame, 0, 12);
  const taskListEnter = ease(frame, 88, 112);
  const cursor = notesEditorCursorForFrame(frame);
  const renderLine = (line: NotesEditorLineView) => (
    <NoteLine frame={frame} line={line} />
  );
  const visibleLine = (line: NotesEditorLineView) => line.text.length > 0 || Boolean(line.caretVisible);

  return (
    <div className={styles.root}>
      <div
        style={{
          height: '100%',
          opacity: editorEnter,
          transform: `translateY(${mix(8, 0, editorEnter)}px)`,
        }}
      >
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
      </div>
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function notesHomeCursorForFrame(frame: number): CursorPath | null {
  const targets = notesHomeCursorTargets();

  if (frame >= 118 && frame < 154) {
    return cursorMove(targets, {end: 146, from: 'homeCenter', start: 118, to: 'newNoteButton'}, 'percent');
  }

  return null;
}

function notesEditorCursorForFrame(frame: number): CursorPath | null {
  const targets = notesEditorCursorTargets();

  if (frame >= 50 && frame < 80) {
    return cursorMove(targets, {end: 70, from: 'editorBody', start: 50, to: 'rightRailTasklist'}, 'percent');
  }

  if (frame >= 98 && frame < 128) {
    return cursorMove(targets, {end: 116, from: 'taskListPanelMiddle', start: 98, to: 'taskListCurrentRow'}, 'percent');
  }

  if (frame >= 126 && frame < 150) {
    return cursorMove(targets, {
      end: 138,
      from: 'taskListPanelMiddle',
      start: 126,
      to: 'taskCheckbox',
      toPoint: {anchor: [0.5, 0.5], offset: [0.3, 0]},
    }, 'percent');
  }

  return null;
}

function notesHomeCursorTargets(): Record<string, TargetRect> {
  return {
    homeCenter: percentTarget(49, 55, 6, 6),
    newNoteButton: percentTarget(72.2, 24.4, 7.4, 4.4),
  };
}

function notesEditorCursorTargets(): Record<string, TargetRect> {
  return {
    editorBody: percentTarget(52, 49, 6, 6),
    rightRailTasklist: percentTarget(80, 35, 8, 5),
    taskCheckbox: percentTarget(22.3, 22.5, 2, 3),
    taskListCurrentRow: percentTarget(15, 27.5, 9, 4),
    taskListPanelMiddle: percentTarget(18, 34, 5, 5),
  };
}

function NoteLine({frame, line}: {frame: number; line: NotesEditorLineView}) {
  if (!line.references?.length) {
    return (
      <>
        {line.text}
        <TextCaret frame={frame} visible={Boolean(line.caretVisible)} />
      </>
    );
  }

  const parts = line.references.reduce<Array<string | ReactNode>>((currentParts, reference) => {
    const nextParts: Array<string | ReactNode> = [];
    for (const part of currentParts) {
      if (typeof part !== 'string') {
        nextParts.push(part);
        continue;
      }

      const tokenIndex = part.indexOf(reference.token);
      if (tokenIndex === -1) {
        nextParts.push(part);
        continue;
      }

      nextParts.push(part.slice(0, tokenIndex));
      nextParts.push(<ReferencePill key={reference.id} label={reference.label} refType={reference.refType} />);
      nextParts.push(part.slice(tokenIndex + reference.token.length));
    }
    return nextParts;
  }, [line.text]);

  return (
    <>
      {parts}
      <TextCaret frame={frame} visible={Boolean(line.caretVisible)} />
    </>
  );
}
