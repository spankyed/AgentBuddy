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
import {useVideoConfig} from 'remotion';
import './NotesShot.module.css';

const styles = makeStyles('NotesShot');

export function NotesShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = notesShotViewForFrame(frame);
  const layout = useAppWindowLayout({hasRightRail: frame > 204, variant});
  const {height, width} = useVideoConfig();
  const taskListEnter = ease(frame, 210, 240);
  const appReveal = ease(frame, 74, 124);
  const homeDock = ease(frame, 72, 128);
  const homeExit = ease(frame, 118, 146);
  const homePlacement = notesHomePlacement({dock: homeDock, height, layout, variant, width});
  const cursor = notesCursorForFrame(frame);
  const renderLine = (line: {caretVisible?: boolean; text: string}) => (
    <NoteLine frame={frame} line={line} />
  );
  const visibleLine = (line: {caretVisible?: boolean; text: string}) => line.text.length > 0 || Boolean(line.caretVisible);

  return (
    <div className={styles.root}>
      <div
        className={styles.appReveal}
        style={{
          opacity: appReveal,
          transform: `translateY(${mix(24, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
        }}
      >
        <AppWindow
          activePlugin="notes"
          breadcrumbs={view.breadcrumbs}
          composer={frame > 160 ? view.composer : false}
          layout={layout}
          rightRail={frame > 204 ? <NotesRightRail state={view.rightRail} /> : undefined}
        >
          <div style={{height: '100%', opacity: ease(frame, 118, 150)}}>
            <NotesLayout
              showTaskList={frame > 210}
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
          </div>
        </AppWindow>
      </div>
      {frame < 148 ? (
        <div
          className={styles.homeMotion}
          style={{
            height: homePlacement.height,
            left: homePlacement.left,
            opacity: 1 - homeExit,
            top: homePlacement.top,
            transform: `translate(-50%, -50%) scale(${mix(1.02, 1, homeDock)})`,
            width: homePlacement.width,
          }}
        >
          <NotesHomeSurface
            favorites={view.home.favorites}
            greeting={view.home.greeting}
            recent={view.home.recent}
            searchQuery={view.home.searchQuery}
            searchResults={view.home.searchResults}
          />
          <div className={styles.homeFade} style={{opacity: homeExit}} />
        </div>
      ) : null}
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function notesCursorForFrame(frame: number) {
  if (frame >= 52 && frame < 88) {
    return {
      from: [55, 68] as [number, number],
      to: [32, 48] as [number, number],
      start: 52,
      end: 80,
    };
  }

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

function notesHomePlacement({
  dock,
  height,
  layout,
  variant,
  width,
}: {
  dock: number;
  height: number;
  layout: ReturnType<typeof useAppWindowLayout>;
  variant?: 'landscape' | 'square';
  width: number;
}) {
  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? width);
  const windowHeight = Number(layout.windowStyle.height ?? height);
  const mainLeft = windowLeft + 72;
  const mainWidth = windowWidth - 72;
  const startWidth = variant === 'square' ? Math.min(680, width - 96) : Math.min(760, width - 180);
  const startHeight = variant === 'square' ? Math.min(620, height - 112) : Math.min(560, height - 180);
  const finalWidth = Math.min(mainWidth, startWidth + 220);
  const finalHeight = Math.min(windowHeight - 152, startHeight + 80);

  return {
    height: mix(startHeight, finalHeight, dock),
    left: mix(width / 2, mainLeft + mainWidth / 2, dock),
    top: mix(height / 2, windowTop + 42 + finalHeight / 2, dock),
    width: mix(startWidth, finalWidth, dock),
  };
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
