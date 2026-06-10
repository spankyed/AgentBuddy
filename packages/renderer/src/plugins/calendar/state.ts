import { setup, type ActorRefFrom, assign } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import { trpc } from '@/core/trpc';
import breadcrumb from '@/core/breadcrumb';
import type { OutgoingCalendarEvents, CalendarEventDTO } from '@app/api';

export const id = 'calendar' as const;

export interface EditorState {
  mode: 'create' | 'edit';
  eventId: string | null;
  defaultDateMs: number | null;
}

export interface CalendarContext {
  events: CalendarEventDTO[];
  viewYear: number;
  viewMonth: number; // 0-11
  editor: EditorState | null;
}

type UIEvents =
  | { type: 'CAL.PREV_MONTH' }
  | { type: 'CAL.NEXT_MONTH' }
  | { type: 'CAL.TODAY' }
  | { type: 'CAL.OPEN_CREATE'; dateMs?: number }
  | { type: 'CAL.OPEN_EDIT'; eventId: string }
  | { type: 'CAL.CLOSE_EDITOR' }
  | { type: 'CAL.SAVE'; eventId?: string; title: string; startsAt: number; endsAt: number; allDay: boolean; notes: string }
  | { type: 'CAL.DELETE'; eventId: string };

export type CalendarEvents = UIEvents | OutgoingCalendarEvents;

const typeOf = safeEvents<CalendarEvents>();

export type CalendarState = ActorRefFrom<typeof calendarState>;

const now = new Date();

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
    removeEvent: assign({
      events: ({ context, event }) => {
        const deletedId = typeOf('CALENDAR_EVENT_DELETED', event).calendarEventId;
        return context.events.filter(e => e.id !== deletedId);
      },
    }),
    prevMonth: assign(({ context }) => context.viewMonth === 0
      ? { viewMonth: 11, viewYear: context.viewYear - 1 }
      : { viewMonth: context.viewMonth - 1 }),
    nextMonth: assign(({ context }) => context.viewMonth === 11
      ? { viewMonth: 0, viewYear: context.viewYear + 1 }
      : { viewMonth: context.viewMonth + 1 }),
    goToToday: assign(() => {
      const today = new Date();
      return { viewYear: today.getFullYear(), viewMonth: today.getMonth() };
    }),
    openCreate: assign({
      editor: ({ event }) => {
        const ev = typeOf('CAL.OPEN_CREATE', event);
        return { mode: 'create' as const, eventId: null, defaultDateMs: ev.dateMs ?? null };
      },
    }),
    openEdit: assign({
      editor: ({ event }) => {
        const ev = typeOf('CAL.OPEN_EDIT', event);
        return { mode: 'edit' as const, eventId: ev.eventId, defaultDateMs: null };
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
}).createMachine({
  id,
  initial: 'canvas',
  context: {
    events: [],
    viewYear: now.getFullYear(),
    viewMonth: now.getMonth(),
    editor: null,
  },
  on: {
    CALENDAR_CONNECTED: { actions: 'setConnectedEvents' },
    CALENDAR_EVENT_CREATED: { actions: 'addEvent' },
    CALENDAR_EVENT_UPDATED: { actions: 'replaceEvent' },
    CALENDAR_EVENT_DELETED: { actions: 'removeEvent' },
    'CAL.PREV_MONTH': { actions: 'prevMonth' },
    'CAL.NEXT_MONTH': { actions: 'nextMonth' },
    'CAL.TODAY': { actions: 'goToToday' },
    'CAL.OPEN_CREATE': { actions: 'openCreate' },
    'CAL.OPEN_EDIT': { actions: 'openEdit' },
    'CAL.CLOSE_EDITOR': { actions: 'closeEditor' },
    'CAL.SAVE': { actions: ['saveEvent', 'closeEditor'] },
    'CAL.DELETE': { actions: ['deleteEvent', 'closeEditor'] },
  },
  states: {
    canvas: {
      meta: breadcrumb('canvas', 'Calendar', true),
    },
  },
});

export default calendarState;
