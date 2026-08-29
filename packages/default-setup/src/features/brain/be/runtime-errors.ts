import { rootEvents } from '@/core/router/bus-emitter';
import { createLogger } from '@/core/shared/debug/logger';
import { randomId } from '@/core/shared/random-id';
import type { BrainRuntimeError } from '@/core/shared-types/brain';
import type { EARS } from '@/core/types';
import { repository } from '@/repository';

const logger = createLogger('brain-runtime');

type RuntimeErrorInput = Omit<BrainRuntimeError, 'errorId' | 'message' | 'stack' | 'timestamp'> & {
  error: unknown;
};

export function toRuntimeError(input: RuntimeErrorInput): BrainRuntimeError {
  const err = input.error instanceof Error ? input.error : new Error(String(input.error));
  const { error, ...context } = input;

  return {
    ...context,
    errorId: randomId(),
    message: err.message || String(input.error),
    stack: err.stack,
    timestamp: Date.now(),
  };
}

export function reportBrainRuntimeError(input: RuntimeErrorInput): BrainRuntimeError {
  const runtimeError = toRuntimeError(input);

  rootEvents.emitLog({
    level: 'error',
    source: 'brain-runtime',
    message: runtimeError.message,
    stack: runtimeError.stack,
    meta: {
      ...runtimeError,
      error: input.error instanceof Error
        ? { name: input.error.name, message: input.error.message, stack: input.error.stack }
        : input.error,
    },
  });

  if (runtimeError.tNodeId) {
    try {
      repository.brainCommands.updateTNodeResult(runtimeError.tNodeId as EARS.EntityId, {
        error: {
          message: runtimeError.message,
          source: runtimeError.source,
          phase: runtimeError.phase,
          errorId: runtimeError.errorId,
          stack: runtimeError.stack,
        },
      });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('"brainCommands" is not registered'))) {
        logger.warn('Failed to persist runtime error on TNode', {
          tNodeId: runtimeError.tNodeId,
          error: err,
        });
      }
    }
  }

  rootEvents.emitOutgoing({
    pluginId: 'brain',
    type: 'BRAIN_RUNTIME_ERROR',
    error: runtimeError,
  } as any);

  return runtimeError;
}
