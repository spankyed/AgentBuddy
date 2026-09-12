import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/helpers';
import { EARS } from '@/__generated__/ears';
import type { CalendarConnectedData, CalendarEventDTO } from './types';
import { repository } from '@abuddy/sdk/ears';
import { toDTO } from './repository/queries';
import './repository/index'; // register repository

type IncomingCalendarEvents =
  | { type: 'CREATE_CALENDAR_EVENT'; title: string; startsAt: number; endsAt: number; allDay?: boolean; notes?: string }
  | { type: 'UPDATE_CALENDAR_EVENT'; id: string; title?: string; startsAt?: number; endsAt?: number; allDay?: boolean; notes?: string }
  | { type: 'DELETE_CALENDAR_EVENT'; id: string };

export type OutgoingCalendarEvents =
  | { type: 'CALENDAR_CONNECTED'; data: CalendarConnectedData }
  | { type: 'CALENDAR_EVENT_CREATED'; calendarEvent: CalendarEventDTO }
  | { type: 'CALENDAR_EVENT_UPDATED'; calendarEvent: CalendarEventDTO }
  | { type: 'CALENDAR_EVENT_DELETED'; calendarEventId: string };

export const calendarSpec = defineSystem('calendar')<IncomingCalendarEvents, OutgoingCalendarEvents>();
export const calendar = calendarSpec.id;

export const calendarSystem = setup({
  types: calendarSpec.types,
  actions: {
    sendCalendarConnectedData: ({ system }) => {
      const data = repository.calendarQueries.connectedData();
      system.get(bus).send(emit(calendar, {
        type: 'CALENDAR_CONNECTED',
        data,
      }));
    },

    createEvent: ({ system, event }) => {
      const ev = calendarSpec.typeOf('CREATE_CALENDAR_EVENT', event);
      const created = repository.calendarCommands.create({
        title: ev.title,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        allDay: ev.allDay,
        notes: ev.notes,
      });

      system.get(bus).send(emit(calendar, {
        type: 'CALENDAR_EVENT_CREATED',
        calendarEvent: toDTO(created),
      }));
    },

    updateEvent: ({ system, event }) => {
      const ev = calendarSpec.typeOf('UPDATE_CALENDAR_EVENT', event);
      const id = ev.id as EARS.EntityId;
      if (!repository.calendarQueries.byId(id)) {
        // Entity is gone — tell clients to drop it so they converge
        system.get(bus).send(emit(calendar, {
          type: 'CALENDAR_EVENT_DELETED',
          calendarEventId: ev.id,
        }));
        return;
      }

      repository.calendarCommands.update(id, {
        title: ev.title,
        notes: ev.notes,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        allDay: ev.allDay,
      });

      const dto = repository.calendarQueries.byIdDTO(id);
      if (dto) {
        system.get(bus).send(emit(calendar, {
          type: 'CALENDAR_EVENT_UPDATED',
          calendarEvent: dto,
        }));
      }
    },

    deleteEvent: ({ system, event }) => {
      const ev = calendarSpec.typeOf('DELETE_CALENDAR_EVENT', event);
      try {
        repository.calendarCommands.delete(ev.id as EARS.EntityId);
      } catch {
        // Already deleted or missing — still emit so clients converge
      }
      system.get(bus).send(emit(calendar, {
        type: 'CALENDAR_EVENT_DELETED',
        calendarEventId: ev.id,
      }));
    },
  },
}).createMachine({
  id: calendar,
  initial: 'idle',
  context: ({}) => ({}),
  on: {
    CREATE_CALENDAR_EVENT: {
      actions: 'createEvent',
    },
    UPDATE_CALENDAR_EVENT: {
      actions: 'updateEvent',
    },
    DELETE_CALENDAR_EVENT: {
      actions: 'deleteEvent',
    },
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendCalendarConnectedData',
        },
      },
    },
  },
});

const calendarEntry: SystemEntry = { spec: calendarSpec, machine: calendarSystem };

export default calendarEntry;
