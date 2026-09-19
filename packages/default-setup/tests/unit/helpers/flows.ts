// default-setup's own flows for brain tests, and reading what they ran (flows as DSL: importFlows from the harness)
import * as path from 'node:path';
import { seedData } from '@abuddy/sdk/utils';
import type { FlowStepTrace } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';

/** default-setup's compiled actions, prompts and flows, seeded as the app's boot seed seeds them */
export function seedDefaultFlows(): void {
  seedData({ compiledDir: path.resolve(__dirname, '../../../dist'), include: { library: new Set(), notes: new Set(), settings: new Set() } });
}

/** The label of the action an action step ran */
export function actionLabel(step: FlowStepTrace): string | undefined {
  const actionId = step.nodeAttributes.actionId as string | undefined;
  return actionId === undefined ? undefined : repository.actionQueries.all().find((a: { id: string }) => a.id === actionId)?.label;
}
