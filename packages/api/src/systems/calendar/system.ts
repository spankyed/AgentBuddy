import { setup } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { bus } from '@/core/system-ids';
import { emit } from '@/core/shared/actor-helpers';
import { EARS } from '@/core/types';
import type { CalendarConnectedData, CalendarEventDTO } from './types';
import { repository } from '@/repository';
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

export const calendarDef = defineSystem('calendar')<IncomingCalendarEvents, OutgoingCalendarEvents>();
export const calendar = calendarDef.id;

export const calendarSystem = setup({
  types: calendarDef.types,
  actions: {
    sendCalendarConnectedData: ({ system }) => {
      const data = repository.calendarQueries.connectedData();
      system.get(bus).send(emit(calendar, {
        type: 'CALENDAR_CONNECTED',
        data,
      }));
    },

    createEvent: ({ system, event }) => {
      const ev = calendarDef.typeOf('CREATE_CALENDAR_EVENT', event);
      const created = repository.calendarCommands.create({
        title: ev.title,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        allDay: ev.allDay,
        notes: ev.notes,
      });

      const dto = repository.calendarQueries.byIdDTO(created.id as EARS.EntityId);
      if (dto) {
        system.get(bus).send(emit(calendar, {
          type: 'CALENDAR_EVENT_CREATED',
          calendarEvent: dto,
        }));
      }
    },

    updateEvent: ({ system, event }) => {
      const ev = calendarDef.typeOf('UPDATE_CALENDAR_EVENT', event);
      const id = ev.id as EARS.EntityId;
      if (!repository.calendarQueries.byId(id)) return;

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
      const ev = calendarDef.typeOf('DELETE_CALENDAR_EVENT', event);
      try {
        repository.calendarCommands.delete(ev.id as EARS.EntityId);
        system.get(bus).send(emit(calendar, {
          type: 'CALENDAR_EVENT_DELETED',
          calendarEventId: ev.id,
        }));
      } catch {
        // Already deleted or missing
      }
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
