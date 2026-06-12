import { BaseEntity, EARS } from '@/core/types';

export interface CalendarEventEntity extends BaseEntity {
  entityType: EARS.Entity.CalendarEvent;
  title: string;
  notes: string;
  startsAt: number;   // epoch ms
  endsAt: number;     // epoch ms
  allDay: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarEventDTO {
  id: string;
  title: string;
  notes: string;
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarConnectedData {
  events: CalendarEventDTO[];
}
