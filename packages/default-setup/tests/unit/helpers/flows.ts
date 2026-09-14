// Flows for brain tests: DSL compiled and imported as rows (as the flow seeder imports them), or default-setup's own
import * as path from 'node:path';
import { compileFlowDSL, type FlowDSL } from '@abuddy/sdk/build';
import { seedData } from '@abuddy/sdk/utils';
import type { FlowStepTrace } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';

export function importFlows(dsl: FlowDSL): void {
  const actions = new Map(repository.actionQueries.all().map((a: { label: string; id: string }) => [a.label, a.id]));
  const prompts = new Map(repository.promptQueries.all().map((p: { label: string; id: string }) => [p.label, p.id]));
  repository.flowsCommands.importFromDSL(compileFlowDSL(dsl, { actions, prompts }));
}

/** default-setup's compiled actions, prompts and flows, seeded as the app's boot seed seeds them */
export function seedDefaultFlows(): void {
  seedData({ compiledDir: path.resolve(__dirname, '../../../dist'), include: { library: new Set(), notes: new Set(), settings: new Set() } });
}

/** The label of the action an action step ran */
export function actionLabel(step: FlowStepTrace): string | undefined {
  const actionId = step.nodeAttributes.actionId as string | undefined;
  return actionId === undefined ? undefined : repository.actionQueries.all().find((a: { id: string }) => a.id === actionId)?.label;
}
