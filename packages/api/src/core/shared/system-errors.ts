import { rootEvents } from '@/core/router/bus-emitter';
import { randomId } from '@/core/shared/random-id';
import { RepositoryError, RepositoryErrorCode } from '@/core/shared/repository';

export type SystemErrorSeverity = 'error' | 'fatal';

export type SystemErrorEvent = {
  type: 'SYSTEM_ERROR';
  pluginId: 'application';
  errorId: string;
  message: string;
  title?: string;
  source?: string;
  operation?: string;
  entityId?: string;
  severity: SystemErrorSeverity;
  stack?: string;
  timestamp: number;
};

export type ApplicationOutgoingEvents =
  | { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean; pluginId: 'application' }
  | SystemErrorEvent;

type ReportSystemErrorInput = {
  error: unknown;
  title?: string;
  source?: string;
  operation?: string;
  entityId?: string;
  severity?: SystemErrorSeverity;
  userMessage?: string;
};

function normalizeError(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || error.toString(),
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function userSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof RepositoryError && error.code === RepositoryErrorCode.NOT_FOUND) {
    return 'That item no longer exists.';
  }
  return fallback;
}

export function reportSystemError(input: ReportSystemErrorInput): SystemErrorEvent {
  const normalized = normalizeError(input.error);
  const message = input.userMessage ?? userSafeMessage(input.error, normalized.message);
  const severity = input.severity ?? 'error';
  const event: SystemErrorEvent = {
    type: 'SYSTEM_ERROR',
    pluginId: 'application',
    errorId: randomId({ prefix: 'err_', counterSafe: true }),
    title: input.title,
    message,
    source: input.source,
    operation: input.operation,
    entityId: input.entityId,
    severity,
    stack: normalized.stack,
    timestamp: Date.now(),
  };

  rootEvents.emitLog({
    level: 'error',
    source: input.source ?? 'system',
    message,
    stack: normalized.stack,
    meta: {
      errorId: event.errorId,
      operation: input.operation,
      entityId: input.entityId,
      severity,
      error: normalized,
    },
  });

  rootEvents.emitOutgoing(event);
  return event;
}
