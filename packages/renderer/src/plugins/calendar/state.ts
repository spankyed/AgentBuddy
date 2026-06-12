import { setup, type ActorRefFrom, assign } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import { trpc } from '@/core/trpc';
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, type TrailClickEvent } from '@/core/actors/route-trailer';
import type { OutgoingCalendarEvents, CalendarEventDTO } from '@app/api';

export const id = 'calendar' as const;

export interface EditorState {
  mode: 'create' | 'edit';
  eventId: string | null;
  defaultDateMs: number | null;
  defaultHasTime: boolean;
}

export interface CalendarContext {
  events: CalendarEventDTO[];
  viewYear: number;
  viewMonth: number; // 0-11
  viewDayMs: number; // local midnight of the day shown in day view
  editor: EditorState | null;
}

type UIEvents =
  | { type: 'CAL.PREV_MONTH' }
  | { type: 'CAL.NEXT_MONTH' }
  | { type: 'CAL.SET_MONTH'; year: number; month: number }
  | { type: 'CAL.TODAY' }
  | { type: 'CAL.OPEN_DAY'; dateMs: number }
  | { type: 'CAL.PREV_DAY' }
  | { type: 'CAL.NEXT_DAY' }
  | { type: 'CAL.OPEN_CREATE'; dateMs?: number; hasTime?: boolean }
  | { type: 'CAL.OPEN_EDIT'; eventId: string }
  | { type: 'CAL.CLOSE_EDITOR' }
  | { type: 'CAL.SAVE'; eventId?: string; title: string; startsAt: number; endsAt: number; allDay: boolean; notes: string }
  | { type: 'CAL.DELETE'; eventId: string };

export type CalendarEvents = UIEvents | OutgoingCalendarEvents | TrailClickEvent;

function localMidnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Shift a local-midnight timestamp by whole days (DST-safe) and derive view fields
function dayView(ms: number, deltaDays = 0) {
  const d = new Date(ms);
  const shifted = new Date(d.getFullYear(), d.getMonth(), d.getDate() + deltaDays);
  return {
    viewDayMs: shifted.getTime(),
    viewYear: shifted.getFullYear(),
    viewMonth: shifted.getMonth(),
  };
}

const typeOf = safeEvents<CalendarEvents>();

export type CalendarState = ActorRefFrom<typeof calendarState>;

const calendarState = setup({
  types: {
    context: {} as CalendarContext,
    events: {} as CalendarEvents,
  },
  actions: {
    setConnectedEvents: assign({
      events: ({ event }) => typeOf('CALENDAR_CONNECTED', event).data.events,
    }),
    addEvent: assign({
      events: ({ context, event }) => {
        const created = typeOf('CALENDAR_EVENT_CREATED', event).calendarEvent;
        return context.events.some(e => e.id === created.id)
          ? context.events
          : [...context.events, created];
      },
    }),
    replaceEvent: assign({
      events: ({ context, event }) => {
        const updated = typeOf('CALENDAR_EVENT_UPDATED', event).calendarEvent;
        return context.events.map(e => e.id === updated.id ? updated : e);
      },
    }),
    removeEvent: assign(({ context, event }) => {
      const deletedId = typeOf('CALENDAR_EVENT_DELETED', event).calendarEventId;
      return {
        events: context.events.filter(e => e.id !== deletedId),
        // Close the editor if it references the deleted event
        editor: context.editor?.eventId === deletedId ? null : context.editor,
      };
    }),
    prevMonth: assign(({ context }) => context.viewMonth === 0
      ? { viewMonth: 11, viewYear: context.viewYear - 1 }
      : { viewMonth: context.viewMonth - 1 }),
    nextMonth: assign(({ context }) => context.viewMonth === 11
      ? { viewMonth: 0, viewYear: context.viewYear + 1 }
      : { viewMonth: context.viewMonth + 1 }),
    goToToday: assign(() => {
      const today = new Date();
      return {
        viewYear: today.getFullYear(),
        viewMonth: today.getMonth(),
        viewDayMs: localMidnight(today),
      };
    }),
    setMonth: assign(({ event }) => {
      const ev = typeOf('CAL.SET_MONTH', event);
      return { viewYear: ev.year, viewMonth: ev.month };
    }),
    openDay: assign(({ event }) => dayView(typeOf('CAL.OPEN_DAY', event).dateMs)),
    prevDay: assign(({ context }) => dayView(context.viewDayMs, -1)),
    nextDay: assign(({ context }) => dayView(context.viewDayMs, 1)),
    openCreate: assign({
      editor: ({ event }) => {
        const ev = typeOf('CAL.OPEN_CREATE', event);
        return {
          mode: 'create' as const,
          eventId: null,
          defaultDateMs: ev.dateMs ?? null,
          defaultHasTime: ev.hasTime ?? false,
        };
      },
    }),
    openEdit: assign({
      editor: ({ event }) => {
        const ev = typeOf('CAL.OPEN_EDIT', event);
        return { mode: 'edit' as const, eventId: ev.eventId, defaultDateMs: null, defaultHasTime: false };
      },
    }),
    closeEditor: assign({ editor: null }),
    saveEvent: ({ event }) => {
      const ev = typeOf('CAL.SAVE', event);
      if (ev.eventId) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_CALENDAR_EVENT',
          id: ev.eventId,
          title: ev.title,
          startsAt: ev.startsAt,
          endsAt: ev.endsAt,
          allDay: ev.allDay,
          notes: ev.notes,
        });
      } else {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_CALENDAR_EVENT',
          title: ev.title,
          startsAt: ev.startsAt,
          endsAt: ev.endsAt,
          allDay: ev.allDay,
          notes: ev.notes,
        });
      }
    },
    deleteEvent: ({ event }) => {
      const ev = typeOf('CAL.DELETE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_CALENDAR_EVENT',
        id: ev.eventId,
      });
    },
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'month',
  context: () => {
    const now = new Date();
    return {
      events: [],
      viewYear: now.getFullYear(),
      viewMonth: now.getMonth(),
      viewDayMs: localMidnight(now),
      editor: null,
    };
  },
  on: {
    CALENDAR_CONNECTED: { actions: 'setConnectedEvents' },
    CALENDAR_EVENT_CREATED: { actions: 'addEvent' },
    CALENDAR_EVENT_UPDATED: { actions: 'replaceEvent' },
    CALENDAR_EVENT_DELETED: { actions: 'removeEvent' },
    'CAL.TODAY': { actions: 'goToToday' },
    'CAL.OPEN_CREATE': { actions: 'openCreate' },
    'CAL.OPEN_EDIT': { actions: 'openEdit' },
    'CAL.CLOSE_EDITOR': { actions: 'closeEditor' },
    'CAL.SAVE': { actions: ['saveEvent', 'closeEditor'] },
    'CAL.DELETE': { actions: ['deleteEvent', 'closeEditor'] },
    TRAIL_CLICK: [
      {
        guard: { type: 'targetIs', params: { view: 'month' } },
        target: '.month',
      },
    ],
  },
  states: {
    month: {
      meta: breadcrumb('month', 'Calendar', true),
      on: {
        'CAL.PREV_MONTH': { actions: 'prevMonth' },
        'CAL.NEXT_MONTH': { actions: 'nextMonth' },
        'CAL.SET_MONTH': { actions: 'setMonth' },
        'CAL.OPEN_DAY': { target: 'day', actions: 'openDay' },
      },
    },
    day: {
      meta: breadcrumbWithParams<CalendarContext>({
        target: 'day',
        getLabel: (ctx) => new Date(ctx.viewDayMs).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      }),
      on: {
        'CAL.PREV_DAY': { actions: 'prevDay' },
        'CAL.NEXT_DAY': { actions: 'nextDay' },
        'CAL.OPEN_DAY': { actions: 'openDay' },
      },
    },
  },
});

export default calendarState;
