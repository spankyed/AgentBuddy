// The query step asks the model for a read-only EARS query from its prompt and the "DB Query System" prompt,
// runs it with the database console's query executor and completes with { query, [as]: rows }
import { beforeEach, describe, expect, it } from 'vitest';
import { mockInference, mockService, importSeeds } from '@abuddy/testing/harness';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { repository } from '@/__generated__/repository';
import { handler } from '../../src/extensions/steps/query/runtime';
import { DEFAULT_MODEL } from '../../src/extensions/steps/llm/model';

type Sent = { type: string; result?: unknown; error?: { message?: string } };

function run(node: Record<string, unknown>) {
  const sent: Sent[] = [];
  const actor = { send: (event: Sent) => sent.push(event) };
  const tNode = { id: 'TNode-query', nodeAttributes: {} } as unknown as TNodeEntity;
  return handler(tNode, { label: 'Find actions', nodeType: 'query', prompt: 'Labels of every action', ...node }, {} as ExecutionContext, actor).then(() => sent);
}

const errorMessage = (sent: Sent[]) => {
  expect(sent.map((event) => event.type)).toEqual(['ERROR']);
  return sent[0].error?.message ?? '';
};

describe('query step', () => {
  beforeEach(async () => {
    await importSeeds({ keys: ['prompts'] });
    repository.actionCommands.create({ label: 'Alpha', actionFn: 'return 1' });
    repository.actionCommands.create({ label: 'Beta', actionFn: 'return 2' });
  });

  it("runs the model's query and completes with the query and its rows under `as`", async () => {
    const query = "return qx(EARS.Entity.Action).pick(['label']).map((a) => a.label).sort();";
    const inference = mockInference('```ts\n' + query + '\n```');

    const sent = await run({ resultKey: 'labels', model: 'openai:gpt-4o-mini' });

    expect(sent).toEqual([{ type: 'COMPLETE', result: { query, labels: ['Alpha', 'Beta'] } }]);
    expect(inference.calls).toHaveLength(1);
    expect(inference.calls[0]).toMatchObject({ model: 'openai:gpt-4o-mini', messages: [{ role: 'user', text: 'Labels of every action' }] });
    // The system prompt describes the live database
    expect(inference.calls[0].kind === 'text' && inference.calls[0].instructions).toContain('Action (2)');
  });

  it('stores the rows under `rows` with the default model when the node names neither', async () => {
    const inference = mockInference("return qx(EARS.Entity.Action).count();");

    const sent = await run({});

    expect(sent).toEqual([{ type: 'COMPLETE', result: { query: 'return qx(EARS.Entity.Action).count();', rows: 2 } }]);
    expect(inference.calls[0].model).toBe(DEFAULT_MODEL);
  });

  it('fails, writing nothing, when the model returns a query that writes', async () => {
    const actionId = repository.actionQueries.all().find((a: { label: string }) => a.label === 'Alpha')!.id;
    mockInference(`tx('${actionId}').update('label', 'Changed'); return true;`);

    const message = errorMessage(await run({}));

    expect(message).toContain('Query step "Find actions" generated a query that writes (tx); query steps only read');
    expect(repository.actionQueries.all().map((a: { label: string }) => a.label).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('fails with the error of a query that does not run', async () => {
    mockInference('return qx(EARS.Entity.Action).pick([');

    expect(errorMessage(await run({}))).toContain('Query step "Find actions" generated a query that failed:');
  });

  it("reports the provider's error when the model can't be called, as without an API key", async () => {
    mockService('inference', {
      generateText: async () => { throw new Error('No API key for anthropic: add one in Settings → Secrets'); },
    } as never);

    expect(errorMessage(await run({}))).toBe(`Query step "Find actions" couldn't generate its query with ${DEFAULT_MODEL}: No API key for anthropic: add one in Settings → Secrets`);
  });
});
