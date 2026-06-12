import type {TargetRect} from '../interaction/cursorTargets';
import {calendarHourPx} from '../../agentbuddy-ui/calendar/calendarTypes';
import {calendarDayScrollOffsetPx} from '../state/calendar';

export type CalendarCursorLayout = {
  windowStyle: {
    height?: number | string;
    left?: number | string;
    top?: number | string;
    width?: number | string;
  };
};

// Layout math mirrors AppWindow chrome + CalendarSurface.module.css.
const toolbarWidth = 72;
const chromeHeaderHeight = 42;
const calendarHeaderHeight = 59; // 12px padding ×2 + 34px Today/New Event row + 1px border
const weekdayRowHeight = 29; // 6px padding ×2 + 16px line + 1px border
const gutterWidth = 64;
const todayCellColumn = 6; // Sat Jun 27 in the Sunday-first 42-cell grid (index 27)
const todayCellRow = 3;

type SurfaceRect = {height: number; left: number; top: number; width: number};

function surfaceRect(layout: CalendarCursorLayout, width: number, height: number): SurfaceRect {
  const windowLeft = Number(layout.windowStyle.left) || 0;
  const windowTop = Number(layout.windowStyle.top) || 0;
  const windowWidth = Number(layout.windowStyle.width) || width;
  const windowHeight = Number(layout.windowStyle.height) || height;
  return {
    height: windowHeight - chromeHeaderHeight,
    left: windowLeft + toolbarWidth,
    top: windowTop + chromeHeaderHeight,
    width: windowWidth - toolbarWidth,
  };
}

export function calendarDayNumberTarget(layout: CalendarCursorLayout, width: number, height: number): TargetRect {
  const surface = surfaceRect(layout, width, height);
  const cellWidth = surface.width / 7;
  const gridTop = surface.top + calendarHeaderHeight + weekdayRowHeight;
  const cellHeight = (surface.height - calendarHeaderHeight - weekdayRowHeight) / 6;
  const pillWidth = 28;
  const pillHeight = 20;
  return {
    left: surface.left + todayCellColumn * cellWidth + cellWidth - 4 - pillWidth,
    top: gridTop + todayCellRow * cellHeight + 4,
    width: pillWidth,
    height: pillHeight,
  };
}

export function calendarTenAmSlotTarget(layout: CalendarCursorLayout, width: number, height: number): TargetRect {
  const surface = surfaceRect(layout, width, height);
  const trackTop = surface.top + calendarHeaderHeight - calendarDayScrollOffsetPx;
  return {
    left: surface.left + gutterWidth,
    top: trackTop + 10 * calendarHourPx,
    width: surface.width - gutterWidth,
    height: calendarHourPx,
  };
}

export function calendarDialogSaveTarget(layout: CalendarCursorLayout, width: number, height: number): TargetRect {
  const surface = surfaceRect(layout, width, height);
  const panelWidth = Math.min(480, surface.width * 0.9);
  const panelHeight = 430; // approximate rendered dialog height
  const panelLeft = surface.left + (surface.width - panelWidth) / 2;
  const panelTop = surface.top + (surface.height - panelHeight) / 2;
  const saveWidth = 52;
  const saveHeight = 32;
  return {
    left: panelLeft + panelWidth - 24 - saveWidth,
    top: panelTop + panelHeight - 24 - saveHeight,
    width: saveWidth,
    height: saveHeight,
  };
}
