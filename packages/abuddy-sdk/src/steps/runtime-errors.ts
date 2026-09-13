import { rootEvents } from '../rpc/index.ts';
import { createLogger } from '../logger/index.ts';
// Import directly — not from '../utils' barrel which pulls in Node-only modules (fs, child_process)
import { randomId } from '../utils/random-id.ts';
import { repository } from '../ears/repository.ts';
import type { EARS } from '../types/entities.ts';
import type { StepRuntimeError } from './types.ts';

const logger = createLogger('step-runtime');

type RuntimeErrorInput = Omit<StepRuntimeError, 'errorId' | 'message' | 'stack' | 'timestamp'> & {
  error: unknown;
};

export function toStepRuntimeError(input: RuntimeErrorInput): StepRuntimeError {
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

export function reportStepRuntimeError(input: RuntimeErrorInput): StepRuntimeError {
  const runtimeError = toStepRuntimeError(input);

  rootEvents.emitLog({
    level: 'error',
    source: 'step-runtime',
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
