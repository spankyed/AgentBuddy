import { getHostModule } from '../runtime/host.ts';
import { rootEvents } from '../runtime/root-events.ts';
import { sendToPlugin } from '../events/index.ts';
// Import directly — not from '../utils' barrel which pulls in Node-only modules (fs, child_process)
import { randomId } from '../utils/random-id.ts';
import { redactSecrets, redactSecretText } from '../utils/redact.ts';
import { builtinRepository } from '../ears/builtin-repositories.ts';
import type { EARS } from '../types/entities.ts';
import type { StepRuntimeError } from '../steps/types.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('step-runtime');

/** Where in a flow run an error happened: the step's phase and the TNode, node, flow and event it belongs to */
export type StepErrorContext = Omit<StepRuntimeError, 'errorId' | 'message' | 'stack' | 'timestamp' | 'source'>;

export interface ReportErrorInput {
  error: unknown;
  /** What reported it: a system or step id (`notes`, `brain-llm`) */
  source?: string;
  title?: string;
  operation?: string;
  entityId?: string;
  severity?: 'error' | 'fatal';
  /** Shown to the user instead of the error's own message */
  userMessage?: string;
  /** The step run the error came from: the error is recorded on its TNode and shown in the flow instead of as a toast */
  step?: StepErrorContext;
}

/** The input the host's `system-errors` module reports (a `SYSTEM_ERROR` for the app to show) */
export type ReportSystemErrorInput = Omit<ReportErrorInput, 'step'>;

interface SystemErrorsHost {
  reportSystemError(input: ReportSystemErrorInput): void;
}

let _systemErrors: SystemErrorsHost | undefined;
function systemErrors(): SystemErrorsHost {
  return _systemErrors ??= getHostModule<SystemErrorsHost>('system-errors');
}

/**
 * Reports an error: logs it and shows it to the user. Without `step` the app shows it as a system error.
 * With `step` it's a flow step's error: it's also recorded on the step's TNode, sent to the brain plugin
 * (`BRAIN_RUNTIME_ERROR`) and returned.
 */
export function reportError(input: ReportErrorInput & { step: StepErrorContext }): StepRuntimeError;
export function reportError(input: ReportErrorInput): StepRuntimeError | undefined;
export function reportError({ step, ...input }: ReportErrorInput): StepRuntimeError | undefined {
  if (!step) {
    systemErrors().reportSystemError(input);
    return undefined;
  }
  return reportStepError(input, step);
}

function reportStepError(input: ReportSystemErrorInput, step: StepErrorContext): StepRuntimeError {
  const err = input.error instanceof Error ? input.error : new Error(String(input.error));
  const source = input.source ?? 'step-runtime';
  const runtimeError: StepRuntimeError = {
    ...step,
    source,
    errorId: randomId(),
    // Provider errors can quote part of the key they were given
    message: redactSecretText(err.message || String(input.error)),
    stack: err.stack && redactSecretText(err.stack),
    timestamp: Date.now(),
  };

  // Recorded in the log only; the flow shows it
  rootEvents.emitLog({
    level: 'error',
    source: 'step-runtime',
    message: runtimeError.message,
    stack: runtimeError.stack,
    meta: { ...runtimeError, error: redactSecrets(input.error) },
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
        logger.warn('Failed to persist runtime error on TNode', { tNodeId: runtimeError.tNodeId, error: err });
      }
    }
  }

  sendToPlugin('brain', { type: 'BRAIN_RUNTIME_ERROR', error: runtimeError });
  return runtimeError;
}
