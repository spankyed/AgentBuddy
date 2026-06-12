import { EARS } from '@/core/types';
import {
  findById,
  createEntityWithDefaults,
  updateEntity,
  RepositoryError,
  RepositoryErrorCode,
} from '@/core/shared/repository';
import { tx } from '@/core/ears/helpers/transaction';
import type { CalendarEventEntity } from '../types';

export const calendarCommands = {
  create: (input: {
    title: string;
    startsAt: number;
    endsAt: number;
    allDay?: boolean;
    notes?: string;
  }): CalendarEventEntity => {
    if (!input.title?.trim()) {
      throw new RepositoryError('Title is required', RepositoryErrorCode.VALIDATION_ERROR);
    }
    if (input.endsAt < input.startsAt) {
      throw new RepositoryError("End time can't be before start time", RepositoryErrorCode.VALIDATION_ERROR);
    }

    return createEntityWithDefaults<CalendarEventEntity>(
      EARS.Entity.CalendarEvent,
      {
        title: input.title,
        notes: input.notes ?? '',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: input.allDay ?? false,
      },
      'CAL',
    );
  },

  update: (id: EARS.EntityId, updates: {
    title?: string;
    notes?: string;
    startsAt?: number;
    endsAt?: number;
    allDay?: boolean;
  }): void => {
    const existing = findById<CalendarEventEntity>(id);
    if (!existing) {
      throw new RepositoryError(`Calendar event ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    if (updates.title !== undefined && !updates.title.trim()) {
      throw new RepositoryError('Title is required', RepositoryErrorCode.VALIDATION_ERROR);
    }

    const startsAt = updates.startsAt ?? existing.startsAt;
    const endsAt = updates.endsAt ?? existing.endsAt;
    if (endsAt < startsAt) {
      throw new RepositoryError("End time can't be before start time", RepositoryErrorCode.VALIDATION_ERROR);
    }

    const filteredUpdates: Record<string, any> = {};
    if (updates.title !== undefined) filteredUpdates.title = updates.title;
    if (updates.notes !== undefined) filteredUpdates.notes = updates.notes;
    if (updates.startsAt !== undefined) filteredUpdates.startsAt = updates.startsAt;
    if (updates.endsAt !== undefined) filteredUpdates.endsAt = updates.endsAt;
    if (updates.allDay !== undefined) filteredUpdates.allDay = updates.allDay;

    if (Object.keys(filteredUpdates).length > 0) {
      updateEntity(id, filteredUpdates);
    }
  },

  delete: (id: EARS.EntityId): void => {
    if (!findById<CalendarEventEntity>(id)) {
      throw new RepositoryError(`Calendar event ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    tx(id).destroy();
  },
} as const;
