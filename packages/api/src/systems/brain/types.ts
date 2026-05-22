// Re-export all shared brain types
export * from '@/core/shared-types/brain';

// Brain-private types
export interface EventReceived {
  eventType: string;
  payload?: unknown;
}
