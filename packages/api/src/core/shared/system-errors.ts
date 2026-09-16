import { rootEvents } from '@/core/router/bus-emitter';
import { randomId, redactSecretText } from '@abuddy/sdk/utils';
import { RepositoryError, RepositoryErrorCode } from '@abuddy/sdk/ears';
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('system-errors');

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

/** The error's name, message and stack, with key-shaped strings redacted (provider errors can quote the key) */
function normalizeError(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecretText(error.message || error.toString()),
      stack: error.stack && redactSecretText(error.stack),
    };
  }

  if (typeof error === 'string') {
    return { message: redactSecretText(error) };
  }

  try {
    return { message: redactSecretText(JSON.stringify(error)) };
  } catch {
    return { message: redactSecretText(String(error)) };
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

export function logErrors(actor: string) {
  return {
    error: (error: unknown) => {
      logger.error(`${actor} State Error:`, { error });
      reportSystemError({
        error,
        title: 'Something went wrong',
        source: actor,
        severity: 'fatal',
      });
      // Write structured JSON for the main process to parse (JSON lines pattern)
      const err = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(JSON.stringify({
        __fatal: true,
        message: err.message,
        stack: err.stack,
        source: actor,
      }) + '\n');
    }
  }
}
