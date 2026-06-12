import {useVideoConfig} from 'remotion';
import {AppWindow} from '../../../agentbuddy-ui/chrome/AppWindow';
import {CalendarSurface} from '../../../agentbuddy-ui/calendar';
import {makeStyles} from '../../../agentbuddy-ui/primitives/makeStyles';
import {calendarBeats, calendarBreadcrumbsForFrame, calendarViewForFrame} from '../../state/calendar';
import {Cursor} from '../../overlays/Cursor';
import {cursorTimeline, viewportPoint} from '../../interaction/cursorTargets';
import type {CursorPath, TargetRect} from '../../interaction/cursorTargets';
import {useAppWindowLayout} from '../../appWindowLayout';
import {calendarDayNumberTarget, calendarDialogSaveTarget, calendarTenAmSlotTarget} from '../../shots/calendarGeometry';
import '../../shots/CalendarShot.module.css';

const styles = makeStyles('CalendarShot');

// Same as the source calendar shot minus the surface entrance fade: the
// full app is steady from the first frame after the hard cut.
export function SimpleCalendarScene({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = calendarViewForFrame(frame);
  const {height, width} = useVideoConfig();
  const layout = useAppWindowLayout({animate: false, variant});
  const cursor = calendarCursorForFrame(frame, layout, width, height);

  return (
    <div className={styles.root}>
      <div style={{height: '100%'}}>
        <AppWindow
          activePlugin="calendar"
          breadcrumbs={calendarBreadcrumbsForFrame(frame)}
          composer={false}
          layout={layout}
        >
          <CalendarSurface frame={frame} state={view} />
        </AppWindow>
      </div>
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function calendarCursorForFrame(
  frame: number,
  layout: ReturnType<typeof useAppWindowLayout>,
  width: number,
  height: number,
): CursorPath | null {
  const targets = calendarCursorTargets(layout, width, height);

  return cursorTimeline(targets, [
    {
      end: calendarBeats.dayNumberMoveEnd,
      from: viewportPoint(width, height, 0.55, 0.58),
      start: calendarBeats.dayNumberMoveStart,
      to: 'dayNumber',
    },
    {
      end: calendarBeats.slotMoveEnd,
      from: 'dayNumber',
      start: calendarBeats.slotMoveStart,
      to: 'tenAmSlot',
      toPoint: {anchor: [0.32, 0.45]},
    },
    {
      end: calendarBeats.saveMoveEnd,
      from: 'tenAmSlot',
      fromPoint: {anchor: [0.32, 0.45]},
      start: calendarBeats.saveMoveStart,
      to: 'saveButton',
    },
  ], frame);
}

function calendarCursorTargets(
  layout: ReturnType<typeof useAppWindowLayout>,
  width: number,
  height: number,
): Record<string, TargetRect> {
  return {
    dayNumber: calendarDayNumberTarget(layout, width, height),
    saveButton: calendarDialogSaveTarget(layout, width, height),
    tenAmSlot: calendarTenAmSlotTarget(layout, width, height),
  };
}
