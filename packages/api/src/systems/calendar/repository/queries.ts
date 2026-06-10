import { EARS } from '@/core/types';
import { findById, findAll } from '@/core/shared/repository';
import type { CalendarEventEntity, CalendarEventDTO } from '../types';

function toDTO(event: CalendarEventEntity): CalendarEventDTO {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes ?? '',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay ?? false,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export const calendarQueries = {
  byId: (id: EARS.EntityId) =>
    findById<CalendarEventEntity>(id),

  byIdDTO: (id: EARS.EntityId): CalendarEventDTO | undefined => {
    const event = findById<CalendarEventEntity>(id);
    return event ? toDTO(event) : undefined;
  },

  allDTOs: (): CalendarEventDTO[] =>
    findAll<CalendarEventEntity>(EARS.Entity.CalendarEvent).map(toDTO),

  connectedData: () => ({
    events: calendarQueries.allDTOs(),
  }),
} as const;
