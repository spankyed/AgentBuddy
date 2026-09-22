import { _rootEvents } from '../runtime/root-events.ts';
import { sendToPlugin } from '../events/index.ts';
import { getDesignated, hasDesignation } from '../designations/index.ts';
// Import directly — not from '../utils' barrel which pulls in Node-only modules (fs, child_process)
import { randomId } from '../utils/random-id.ts';
import { RepositoryError, RepositoryErrorCode } from '@abuddy/ears';
import { redactSecrets, redactSecretText } from '../utils/redact.ts';
import { tnodeRepository } from '../repositories/tnode-repository.ts';
import type { EARS } from '../types/entities.ts';
import type { StepRuntimeError } from '../steps/types.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('step-runtime');

/** Where in a flow run an error happened: the step's phase and the TNode, node, flow and event it belongs to */
export type StepErrorContext = Omit<StepRuntimeError, 'errorId' | 'message' | 'stack' | 'timestamp' | 'source'>;

/** How loudly a system error is shown: an error page, a toast, or neither */
export type SystemErrorSeverity = 'diagnostic' | 'error' | 'fatal';

export interface ReportErrorInput {
  error: unknown;
  /** What reported it: a system or step id (`notes`, `brain-llm`) */
  source?: string;
  title?: string;
  operation?: string;
  entityId?: string;
  /**
   * How loudly the app shows it. `fatal` replaces the window with an error page, `error` raises a
   * toast, and `diagnostic` does neither: it is logged and recorded like the others, and reaches the
   * Logs plugin and `takeSystemErrors()` the same way, but it does not interrupt.
   *
   * `diagnostic` is for a report whose reader is whoever is building the app or a pack — a send to a
   * plugin nobody declares, say. The person using the app cannot act on it, and a toast reading
   * "Something went wrong" over a correct action of theirs costs more than it tells anyone.
   */
  severity?: SystemErrorSeverity;
  /** Shown to the user instead of the error's own message */
  userMessage?: string;
  /** The step run the error came from: the error is recorded on its TNode and shown in the flow instead of as a toast */
  step?: StepErrorContext;
}

/** A system error's report, without a step */
export type ReportSystemErrorInput = Omit<ReportErrorInput, 'step'>;

/** What the app shows for a system error: sent to the `host/application` plugin */
export type SystemErrorEvent = {
  type: 'SYSTEM_ERROR';
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

/**
 * Reports an error: logs it and shows it to the user. Without `step` the app shows it as a system error.
 * With `step` it's a flow step's error: it's also recorded on the step's TNode, sent to the plugin playing the
 * `brain` role (`BRAIN_RUNTIME_ERROR`) and returned.
 */
export function reportError(input: ReportErrorInput & { step: StepErrorContext }): StepRuntimeError;
export function reportError(input: ReportErrorInput): StepRuntimeError | undefined;
export function reportError({ step, ...input }: ReportErrorInput): StepRuntimeError | undefined {
  if (!step) {
    reportSystemError(input);
    return undefined;
  }
  return reportStepError(input, step);
}

/** The error's name, message and stack, with key-shaped strings redacted (provider errors can quote the key) */
function normalizeError(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecretText(error.message || error.toString()),
      stack: error.stack && redactSecretText(error.stack),
    };
  }
  if (typeof error === 'string') return { message: redactSecretText(error) };
  try {
    return { message: redactSecretText(JSON.stringify(error)) };
  } catch {
    return { message: redactSecretText(String(error)) };
  }
}

function userSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof RepositoryError && error.code === RepositoryErrorCode.NOT_FOUND) return 'That item no longer exists.';
  return fallback;
}

/** Logs a system error and sends it to the app, which shows it */
function reportSystemError(input: ReportSystemErrorInput): void {
  const normalized = normalizeError(input.error);
  const message = input.userMessage ?? userSafeMessage(input.error, normalized.message);
  const severity = input.severity ?? 'error';
  const event: SystemErrorEvent = {
    type: 'SYSTEM_ERROR',
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
  _rootEvents.emitLog({
    level: 'error',
    source: input.source ?? 'system',
    message,
    stack: normalized.stack,
    meta: { errorId: event.errorId, operation: input.operation, entityId: input.entityId, severity, error: normalized },
  });
  _rootEvents.emitOutgoing({ to: 'host/application', event });
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
  _rootEvents.emitLog({
    level: 'error',
    source: 'step-runtime',
    message: runtimeError.message,
    stack: runtimeError.stack,
    meta: { ...runtimeError, error: redactSecrets(input.error) },
  });

  if (runtimeError.tNodeId) {
    try {
      tnodeRepository.updateTNodeResult(runtimeError.tNodeId as EARS.EntityId, {
        error: {
          message: runtimeError.message,
          source: runtimeError.source,
          phase: runtimeError.phase,
          errorId: runtimeError.errorId,
          stack: runtimeError.stack,
        },
      });
    } catch (err) {
      logger.warn('Failed to persist runtime error on TNode', { tNodeId: runtimeError.tNodeId, error: err });
    }
  }

  // The flow shows it in the plugin playing the brain role, if any does
  if (hasDesignation('brain')) sendToPlugin(getDesignated('brain'), { type: 'BRAIN_RUNTIME_ERROR', error: runtimeError });
  return runtimeError;
}
