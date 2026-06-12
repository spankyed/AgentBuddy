import type {CSSProperties, ReactNode} from 'react';
import {AppWindow} from '../../../agentbuddy-ui/chrome/AppWindow';
import {NotesLayout} from '../../../agentbuddy-ui/notes/NotesLayout';
import {NotesHomeSurface} from '../../../agentbuddy-ui/notes/NotesHomeSurface';
import {NotesRightRail} from '../../../agentbuddy-ui/notes/NotesRightRail';
import {ReferencePill} from '../../../agentbuddy-ui/chat/ReferencePill';
import {TextCaret} from '../../../agentbuddy-ui/primitives/TextCaret';
import {notesEditorViewForFrame, notesHomeViewForFrame, type NotesEditorLineView} from '../../state/notes';
import {Cursor} from '../../overlays/Cursor';
import {cursorMove, percentTarget, viewportPoint} from '../../interaction/cursorTargets';
import type {CursorPath, TargetRect} from '../../interaction/cursorTargets';
import {useAppWindowLayout} from '../../appWindowLayout';
import {ease, mix} from '../../state/timeline';
import {makeStyles} from '../../../agentbuddy-ui/primitives/makeStyles';
import {useVideoConfig} from 'remotion';
import {notesHomeNewNoteButtonTarget} from '../../shots/notesGeometry';
import '../../shots/NotesShot.module.css';

const styles = makeStyles('NotesShot');
const notesHomeDuration = 156;
const editorCrossfadeFrames = 12;
const layerStyle: CSSProperties = {position: 'absolute', inset: 0};

// Chrome stays pinned in both phases; the home -> editor switch crossfades
// two full app windows (montage-style) so the frame never leaves the screen.
export function SimpleNotesScene({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  if (frame < notesHomeDuration) {
    return <SimpleNotesHome frame={frame} variant={variant} />;
  }
  const editorFrame = frame - notesHomeDuration;
  return (
    <>
      {editorFrame < editorCrossfadeFrames ? (
        <div style={layerStyle}>
          <SimpleNotesHome frame={notesHomeDuration - 1} variant={variant} />
        </div>
      ) : null}
      <div style={{...layerStyle, opacity: ease(editorFrame, 0, editorCrossfadeFrames)}}>
        <SimpleNotesEditor frame={editorFrame} variant={variant} />
      </div>
    </>
  );
}

function SimpleNotesHome({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const home = notesHomeViewForFrame(frame);
  const {height, width} = useVideoConfig();
  const layout = useAppWindowLayout({animate: false, variant});
  const cursor = notesHomeCursorForFrame(frame, layout, width, height);

  return (
    <div className={styles.root}>
      <AppWindow
        activePlugin="notes"
        breadcrumbs={['Notes']}
        layout={layout}
        mainBackground="rgb(23 23 23)"
        surfaceBackground="rgb(23 23 23)"
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

function SimpleNotesEditor({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesEditorViewForFrame(frame);
  const taskListVisible = frame >= 88;
  const layout = useAppWindowLayout({animate: false, hasRightRail: true, variant});
  const taskListEnter = ease(frame, 88, 112);
  const cursor = notesEditorCursorForFrame(frame);
  const renderLine = (line: NotesEditorLineView) => (
    <NoteLine frame={frame} line={line} />
  );
  const visibleLine = (line: NotesEditorLineView) => line.text.length > 0 || Boolean(line.caretVisible);

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
          editorStyle={{opacity: contentSwapForFrame(frame)}}
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

function notesHomeCursorForFrame(
  frame: number,
  layout: ReturnType<typeof useAppWindowLayout>,
  width: number,
  height: number,
): CursorPath | null {
  const targets = notesHomeCursorTargets(layout, width, height);

  if (frame >= 118 && frame < 154) {
    return cursorMove(targets, {
      end: 146,
      from: viewportPoint(width, height, 0.52, 0.52),
      start: 118,
      to: 'newNoteButton',
      toPoint: {anchor: [0.52, 0.5]},
    });
  }

  return null;
}

// The editor content swaps notes at 76 (tasklist overview) and 122 (todo);
// fade the incoming content in instead of popping it.
function contentSwapForFrame(frame: number) {
  if (frame >= 122) return ease(frame, 122, 130);
  if (frame >= 76) return ease(frame, 76, 84);
  return 1;
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

function notesHomeCursorTargets(
  layout: ReturnType<typeof useAppWindowLayout>,
  width: number,
  height: number,
): Record<string, TargetRect> {
  return {
    homeCenter: percentTarget(49, 55, 6, 6),
    newNoteButton: notesHomeNewNoteButtonTarget(layout, width),
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
