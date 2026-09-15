import { rootEvents } from '../rpc/index.ts';
import { createLogger } from '../logger/index.ts';
// Import directly — not from '../utils' barrel which pulls in Node-only modules (fs, child_process)
import { randomId } from '../utils/random-id.ts';
import { redactSecrets, redactSecretText } from '../utils/redact.ts';
import { builtinRepository } from '../ears/builtin-repositories.ts';
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
    // Provider errors can quote part of the key they were given
    message: redactSecretText(err.message || String(input.error)),
    stack: err.stack && redactSecretText(err.stack),
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
      error: redactSecrets(input.error),
    },
  });

  if (runtimeError.tNodeId) {
    try {
      builtinRepository.brainCommands.updateTNodeResult(runtimeError.tNodeId as EARS.EntityId, {
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
  });

  return runtimeError;
}
