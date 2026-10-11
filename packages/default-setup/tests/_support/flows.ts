// default-setup's own flows for brain tests, and reading what they ran (flows as DSL: importFlows from the harness)
import * as path from 'node:path';
import { importCompiledContent } from '@apack/sdk/utils';
import type { FlowStepTrace } from '@apack/testing/harness';
import { repository } from '#generated/repository.ts';

/** default-setup's compiled actions, prompts and flows, written as the app's boot apply content them */
export function writeDefaultFlows(): void {
  importCompiledContent({ compiledDir: path.resolve(__dirname, '../../dist', 'runtime', 'content'), include: { library: new Set(), notes: new Set(), settings: new Set() } });
}

/** The label of the action an action step ran */
export function actionLabel(step: FlowStepTrace): string | undefined {
  const actionId = step.nodeAttributes.actionId as string | undefined;
  return actionId === undefined ? undefined : repository.actionQueries.all().find((a: { id: string }) => a.id === actionId)?.label;
}
