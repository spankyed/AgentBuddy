import { compile } from '@/systems/flows/dsl/compiler';
import type { FlowDSL } from '@/systems/flows/dsl/types';
import { EARS } from '@/core/types';
import { BinaryOperator } from '@/systems/flows/config/types';
import { findEntity, filterEntities, filterRelations } from './helpers/compiled-result';
import { wrapInFlow, makeSwitchDSL, parsedPredicate } from './helpers/dsl-factories';
import { steps, ctx, flows } from './helpers/fixtures';

/*─────────────────────────────────────────────────────────────────
 * Tests
 *─────────────────────────────────────────────────────────────────*/

describe('compile', () => {
  describe('flow structure', () => {
    it('creates flow entity with correct label, entityType, flowType', () => {
      const dsl: FlowDSL = {
        'My Flow': [{ event: 'start', exits: [[]] }],
      };
      const result = compile(dsl);
      const flow = findEntity(result.entity, (e: any) => e.entityType === EARS.Entity.Flow);

      expect(flow).toBeDefined();
      expect(flow.label).toBe('My Flow');
      expect(flow.entityType).toBe(EARS.Entity.Flow);
      expect(flow.flowType).toBe('workflow');
    });

    it('creates listener node for each track with correct eventType', () => {
      const dsl: FlowDSL = {
        'My Flow': [
          { event: 'user.created', exits: [[]] },
          { event: 'user.updated', exits: [[]] },
        ],
      };
      const result = compile(dsl);
      const listenerNodes = filterEntities(result.entity, (e: any) => e.nodeType === 'listener');

      expect(listenerNodes).toHaveLength(2);
      expect(listenerNodes[0].eventType).toBe('user.created');
      expect(listenerNodes[1].eventType).toBe('user.updated');
      expect(listenerNodes[0].trackKey).toBe('My Flow:track:0');
      expect(listenerNodes[1].trackKey).toBe('My Flow:track:1');
    });

    it('assigns entry_event role to first track listener node only', () => {
      const dsl: FlowDSL = {
        'My Flow': [
          { event: 'first', exits: [[]] },
          { event: 'second', exits: [[]] },
        ],
      };
      const result = compile(dsl);
      const listenerNodes = filterEntities(result.entity, (e: any) => e.nodeType === 'listener');

      expect(result.role).toHaveLength(1);
      expect(result.role[0].entityId).toBe(listenerNodes[0].id);
      expect(result.role[0].role).toBe('entry_event');
    });

    it('links all nodes to flow via CONTAINS relation', () => {
      const dsl: FlowDSL = {
        'My Flow': [
          {
            event: 'start',
            exits: [[{ type: 'action', action: 'doA' }, { type: 'action', action: 'doB' }]],
          },
        ],
      };
      const result = compile(dsl);
      const flow = findEntity(result.entity, (e: any) => e.entityType === EARS.Entity.Flow);
      const containsRels = filterRelations(result.relation, (r) => r.kind === EARS.RelKind.CONTAINS && r.source === flow.id);

      // 1 listener + 2 action nodes = 3 CONTAINS
      expect(containsRels).toHaveLength(3);
    });
  });

  describe('node compilation - all types', () => {
    it('action: entity has nodeType, actionId, params, fieldMappings', () => {
      const dsl = wrapInFlow([steps.action]);
      const result = compile(dsl, { actions: ctx.actions });
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'action');

      expect(node.actionId).toBe('Action-send-123');
      expect(node.params).toEqual({ to: 'user@test.com' });
      expect(node.fieldMappings).toEqual([{ target: 'subject', source: '$.data.title' }]);
    });

    it('llm: entity has promptTemplateId, model, temperature, maxTokens, systemPrompt, fieldMappings', () => {
      const dsl = wrapInFlow([steps.llm]);
      const result = compile(dsl, { prompts: ctx.prompts });
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'llm');

      expect(node.promptTemplateId).toBe('Prompt-cls-456');
      expect(node.model).toBe('gpt-4');
      expect(node.temperature).toBe(0.7);
      expect(node.maxTokens).toBe(500);
      expect(node.systemPrompt).toBe('You are helpful');
      expect(node.fieldMappings).toEqual([{ target: 'input', source: '$.data.text' }]);
    });

    it('fire: entity has eventType, scope, payload', () => {
      const dsl = wrapInFlow([steps.fire]);
      const result = compile(dsl);
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'fire');

      expect(node.eventType).toBe('notify.sent');
      expect(node.scope).toBe('global');
      expect(node.payload).toEqual({ msg: 'hello' });
    });

    it('transform: entity has script, outputType', () => {
      const dsl = wrapInFlow([steps.transform]);
      const result = compile(dsl);
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'transform');

      expect(node.script).toBe('return x + 1');
      expect(node.outputType).toBe('text');
    });

    it('query: entity has prompt, resultKey (as)', () => {
      const dsl = wrapInFlow([steps.query]);
      const result = compile(dsl);
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'query');

      expect(node.prompt).toBe('Find user by name');
      expect(node.resultKey).toBe('foundUser');
    });

    it('flow: entity has flowRef resolved from context, propagateCtx, fieldMappings', () => {
      const dsl = flows.parentChild;
      const result = compile(dsl);
      const flowNode = findEntity(result.entity, (e: any) => e.nodeType === 'flow');
      const childFlow = findEntity(result.entity, (e: any) => e.entityType === EARS.Entity.Flow && e.label === 'Child');

      expect(flowNode.flowRef).toBe(childFlow.id);
      expect(flowNode.propagateCtx).toBe(false);
      expect(flowNode.fieldMappings).toEqual([{ target: 'userId', source: '$.data.id' }]);
    });

    it('create: entity has entityTypeTarget', () => {
      const dsl = wrapInFlow([steps.create]);
      const result = compile(dsl);
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'create');

      expect(node.entityTypeTarget).toBe('Thread');
    });

    it('update: entity has onMissing', () => {
      const dsl = wrapInFlow([steps.update]);
      const result = compile(dsl);
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'update');

      expect(node.onMissing).toBe('ignore');
    });

    it('keep_alive: entity has nodeType keep_alive', () => {
      const dsl = wrapInFlow([steps.keepAlive]);
      const result = compile(dsl);
      const node = findEntity(result.entity, (e: any) => e.nodeType === 'keep_alive');

      expect(node).toBeDefined();
      expect(node.nodeType).toBe('keep_alive');
    });
  });

  describe('edge wiring', () => {
    it('sequential steps: each step wired to next via TRANSITIONS_TO', () => {
      const dsl = wrapInFlow([
        { type: 'action', action: 'a' },
        { type: 'action', action: 'b' },
        { type: 'action', action: 'c' },
      ]);
      const result = compile(dsl);
      const nodes = filterEntities(result.entity, (e: any) => e.nodeType === 'action');
      const transitions = filterRelations(result.relation, (r) => r.kind === EARS.RelKind.TRANSITIONS_TO);

      // listener->a, a->b, b->c = 3 transitions
      const aToB = transitions.find((r) => r.source === nodes[0].id && r.target === nodes[1].id);
      const bToC = transitions.find((r) => r.source === nodes[1].id && r.target === nodes[2].id);

      expect(aToB).toBeDefined();
      expect(bToC).toBeDefined();
    });

    it('listener -> first step: TRANSITIONS_TO edge', () => {
      const dsl = wrapInFlow([{ type: 'action', action: 'first' }]);
      const result = compile(dsl);
      const listener = findEntity(result.entity, (e: any) => e.nodeType === 'listener');
      const action = findEntity(result.entity, (e: any) => e.nodeType === 'action');
      const edge = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === listener.id && r.target === action.id
      );

      expect(edge).toHaveLength(1);
    });

    it('no edge after last step', () => {
      const dsl = wrapInFlow([{ type: 'action', action: 'only' }]);
      const result = compile(dsl);
      const action = findEntity(result.entity, (e: any) => e.nodeType === 'action');
      const outgoing = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === action.id
      );

      expect(outgoing).toHaveLength(0);
    });

    it('step with `next` field: edge to labeled target instead of sequential', () => {
      const dsl = wrapInFlow([
        { type: 'action', action: 'a', next: 'target' },
        { type: 'action', action: 'b' },
        { type: 'action', action: 'c', label: 'target' },
      ]);
      const result = compile(dsl);
      const nodeA = findEntity(result.entity, (e: any) => e.nodeType === 'action' && e.label === 'a');
      const nodeB = findEntity(result.entity, (e: any) => e.nodeType === 'action' && e.label === 'b');
      const nodeC = findEntity(result.entity, (e: any) => e.label === 'target');

      // a -> target (not a -> b)
      const aEdges = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === nodeA.id
      );
      expect(aEdges).toHaveLength(1);
      expect(aEdges[0].target).toBe(nodeC.id);

      // b -> c still wired sequentially
      const bEdges = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === nodeB.id
      );
      expect(bEdges).toHaveLength(1);
      expect(bEdges[0].target).toBe(nodeC.id);
    });
  });

  describe('switch node', () => {
    it('entity conditions array has predicate with correct key/operator/value', () => {
      const dsl = makeSwitchDSL([
        { if: '$.status == active', steps: [{ type: 'action', action: 'a' }] },
      ]);
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');

      expect(switchNode.conditions).toHaveLength(1);
      expect(switchNode.conditions[0].predicate).toEqual({
        key: '$.status',
        operator: BinaryOperator.EQUALS,
        value: 'active',
      });
    });

    it('else appended as condition with undefined predicate', () => {
      const dsl = makeSwitchDSL(
        [{ if: '$.x == 1', steps: [{ type: 'action', action: 'a' }] }],
        [{ type: 'action', action: 'fallback' }],
      );
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');

      // 1 real condition + 1 else = 2
      expect(switchNode.conditions).toHaveLength(2);
      expect(switchNode.conditions[1].predicate).toBeUndefined();
    });

    it('no else -> no extra condition', () => {
      const dsl = makeSwitchDSL([
        { if: '$.x == 1', steps: [{ type: 'action', action: 'a' }] },
      ]);
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');

      expect(switchNode.conditions).toHaveLength(1);
    });

    it('empty condition steps -> no TRANSITIONS_TO edge for that branch', () => {
      // Empty `steps: []` is a valid no-op branch. The compiler should
      // still record the condition, but emit no outgoing edge for it —
      // at runtime `nextNodeForBranch('branch-0')` returns undefined and
      // the chain ends cleanly.
      const dsl = makeSwitchDSL([
        { if: '$.x == 1', steps: [] },
        { if: '$.x == 2', steps: [{ type: 'action', action: 'real' }] },
      ]);
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');

      // Both conditions are recorded on the switch entity.
      expect(switchNode.conditions).toHaveLength(2);

      // Only the non-empty branch has an outgoing TRANSITIONS_TO edge.
      const branchEdges = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === switchNode.id,
      );
      expect(branchEdges).toHaveLength(1);
      expect((branchEdges[0] as any).info?.sourceHandle).toBe('branch-1');
    });

    it('empty else -> no TRANSITIONS_TO edge for the else branch', () => {
      // `else: []` means "no condition matched, do nothing". The compiler
      // should not emit an else edge at all.
      const dsl = makeSwitchDSL(
        [{ if: '$.x == 1', steps: [{ type: 'action', action: 'a' }] }],
        [],
      );
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');

      // The only outgoing edge is branch-0. No branch-1 / no else edge.
      const branchEdges = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === switchNode.id,
      );
      expect(branchEdges).toHaveLength(1);
      expect((branchEdges[0] as any).info?.sourceHandle).toBe('branch-0');
    });

    it('edge to condition branch has sourceHandle: "branch-0"', () => {
      const dsl = makeSwitchDSL([
        { if: '$.x == 1', steps: [{ type: 'action', action: 'branchA' }] },
      ]);
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');
      const branchEdge = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === switchNode.id
      ).find((r: any) => r.info?.sourceHandle === 'branch-0');

      expect(branchEdge).toBeDefined();
    });

    it('edge to else branch has sourceHandle: "branch-{N}" where N = conditions.length', () => {
      const dsl = makeSwitchDSL(
        [
          { if: '$.x == 1', steps: [{ type: 'action', action: 'a' }] },
          { if: '$.x == 2', steps: [{ type: 'action', action: 'b' }] },
        ],
        [{ type: 'action', action: 'fallback' }],
      );
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');
      const elseEdge = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === switchNode.id
      ).find((r: any) => r.info?.sourceHandle === 'branch-2');

      expect(elseEdge).toBeDefined();
    });

    it('inline steps: CONTAINS relation links them to flow', () => {
      const dsl = makeSwitchDSL([
        { if: '$.x == 1', steps: [{ type: 'action', action: 'inline1' }] },
      ]);
      const result = compile(dsl);
      const flow = findEntity(result.entity, (e: any) => e.entityType === EARS.Entity.Flow);
      const inlineNode = findEntity(result.entity, (e: any) =>
        e.nodeType === 'action' && e.label === 'inline1'
      );
      const containsRel = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.CONTAINS && r.source === flow.id && r.target === inlineNode.id
      );

      expect(containsRel).toHaveLength(1);
    });

    it('inline steps: sequential edges between inline steps', () => {
      const dsl = makeSwitchDSL([
        {
          if: '$.x == 1',
          steps: [
            { type: 'action', action: 'step1' },
            { type: 'action', action: 'step2' },
          ],
        },
      ]);
      const result = compile(dsl);
      const step1 = findEntity(result.entity, (e: any) => e.label === 'step1');
      const step2 = findEntity(result.entity, (e: any) => e.label === 'step2');
      const edge = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === step1.id && r.target === step2.id
      );

      expect(edge).toHaveLength(1);
    });

    it('convergence: last inline step wires to continuation (next step after switch)', () => {
      const dsl = makeSwitchDSL(
        [{ if: '$.x == 1', steps: [{ type: 'action', action: 'branchStep' }] }],
        undefined,
        { type: 'action', action: 'afterSwitch' },
      );
      const result = compile(dsl);
      const branchStep = findEntity(result.entity, (e: any) => e.label === 'branchStep');
      const afterSwitch = findEntity(result.entity, (e: any) => e.label === 'afterSwitch');
      const convergeEdge = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === branchStep.id && r.target === afterSwitch.id
      );

      expect(convergeEdge).toHaveLength(1);
    });

    it('multiple conditions: each gets correct branch-{ci} handle', () => {
      const dsl = makeSwitchDSL([
        { if: '$.a == 1', steps: [{ type: 'action', action: 'b0' }] },
        { if: '$.a == 2', steps: [{ type: 'action', action: 'b1' }] },
        { if: '$.a == 3', steps: [{ type: 'action', action: 'b2' }] },
      ]);
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');
      const switchEdges = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === switchNode.id
      );

      const handles = switchEdges.map((e: any) => e.info?.sourceHandle).sort();
      expect(handles).toEqual(['branch-0', 'branch-1', 'branch-2']);
    });
  });

  describe('schedule tracks', () => {
    it('creates schedule node with cronExpression', () => {
      const result = compile(flows.scheduleFlow);
      const scheduleNode = findEntity(result.entity, (e: any) => e.nodeType === 'schedule');

      expect(scheduleNode).toBeDefined();
      expect(scheduleNode.cronExpression).toBe('0 9 * * 1-5');
      expect(scheduleNode.label).toBe('Weekday Morning');
    });

    it('does not assign entry_event role to schedule track', () => {
      const result = compile(flows.scheduleFlow);
      const scheduleNode = findEntity(result.entity, (e: any) => e.nodeType === 'schedule');

      const entryRole = result.role.find(r => r.entityId === scheduleNode.id && r.role === 'entry_event');
      expect(entryRole).toBeUndefined();
    });

    it('wires schedule node to first exit step via TRANSITIONS_TO', () => {
      const result = compile(flows.scheduleFlow);
      const scheduleNode = findEntity(result.entity, (e: any) => e.nodeType === 'schedule');
      const actionNode = findEntity(result.entity, (e: any) => e.nodeType === 'action');
      const edge = filterRelations(result.relation, (r) =>
        r.kind === EARS.RelKind.TRANSITIONS_TO && r.source === scheduleNode.id && r.target === actionNode.id
      );

      expect(edge).toHaveLength(1);
    });

    it('mixed flow: entry_event role goes to listener, not schedule', () => {
      const result = compile(flows.mixedFlow);
      const listenerNode = findEntity(result.entity, (e: any) => e.nodeType === 'listener');
      const scheduleNode = findEntity(result.entity, (e: any) => e.nodeType === 'schedule');

      expect(result.role).toHaveLength(1);
      expect(result.role[0].entityId).toBe(listenerNode.id);
      expect(result.role[0].role).toBe('entry_event');

      const scheduleRole = result.role.find(r => r.entityId === scheduleNode.id);
      expect(scheduleRole).toBeUndefined();
    });

    it('root schedule-only flow compiles with root role and no entry_event role', () => {
      const result = compile({
        'Scheduled Root': {
          root: true,
          tracks: [
            { schedule: '0 * * * *', exits: [[{ type: 'action', action: 'report' }]] },
          ],
        },
      } as FlowDSL);
      const rootFlow = findEntity(result.entity, (e: any) => e.label === 'Scheduled Root');
      const scheduleNode = findEntity(result.entity, (e: any) => e.nodeType === 'schedule');

      expect(result.role).toContainEqual({ entityId: rootFlow.id, role: 'root_flow' });
      expect(result.role.find(r => r.role === 'entry_event')).toBeUndefined();
      expect(scheduleNode).toBeDefined();
    });

    it('root schedule-first flow does not promote later event track to entry_event', () => {
      const result = compile({
        'Schedule First Root': {
          root: true,
          tracks: [
            { schedule: '0 * * * *', exits: [[{ type: 'action', action: 'poll' }]] },
            { event: 'manual.start', exits: [[{ type: 'action', action: 'start' }]] },
          ],
        },
      } as FlowDSL);

      expect(result.role.find(r => r.role === 'entry_event')).toBeUndefined();
    });
  });

  describe('expression parsing (via switch conditions)', () => {
    it('"$.key == value" -> operator EQUALS', () => {
      const pred = parsedPredicate('$.key == value');
      expect(pred.key).toBe('$.key');
      expect(pred.operator).toBe(BinaryOperator.EQUALS);
      expect(pred.value).toBe('value');
    });

    it('"$.key != value" -> NOT_EQUALS', () => {
      const pred = parsedPredicate('$.key != value');
      expect(pred.operator).toBe(BinaryOperator.NOT_EQUALS);
    });

    it('"$.key > 5" -> GREATER_THAN, value: 5 (number)', () => {
      const pred = parsedPredicate('$.key > 5');
      expect(pred.operator).toBe(BinaryOperator.GREATER_THAN);
      expect(pred.value).toBe(5);
    });

    it('"$.key >= 5" -> GREATER_THAN_OR_EQUALS', () => {
      const pred = parsedPredicate('$.key >= 5');
      expect(pred.operator).toBe(BinaryOperator.GREATER_THAN_OR_EQUALS);
      expect(pred.value).toBe(5);
    });

    it('>= parsed before > (longest match first)', () => {
      const predGte = parsedPredicate('$.key >= 10');
      const predGt = parsedPredicate('$.key > 10');
      expect(predGte.operator).toBe(BinaryOperator.GREATER_THAN_OR_EQUALS);
      expect(predGt.operator).toBe(BinaryOperator.GREATER_THAN);
    });

    it('"$.key contains foo" -> CONTAINS', () => {
      const pred = parsedPredicate('$.key contains foo');
      expect(pred.operator).toBe(BinaryOperator.CONTAINS);
      expect(pred.value).toBe('foo');
    });

    it('"$.key is_empty" -> IS_EMPTY, no value', () => {
      const pred = parsedPredicate('$.key is_empty');
      expect(pred.operator).toBe(BinaryOperator.IS_EMPTY);
      expect(pred.value).toBeUndefined();
    });

    it('"$.key is_null" -> IS_NULL, no value', () => {
      const pred = parsedPredicate('$.key is_null');
      expect(pred.operator).toBe(BinaryOperator.IS_NULL);
      expect(pred.value).toBeUndefined();
    });

    it('boolean values: "true" -> true, "false" -> false', () => {
      const predTrue = parsedPredicate('$.flag == true');
      expect(predTrue.value).toBe(true);

      const predFalse = parsedPredicate('$.flag == false');
      expect(predFalse.value).toBe(false);
    });

    it('quoted strings: "\'hello\'" -> "hello"', () => {
      const pred = parsedPredicate("$.name == 'hello'");
      expect(pred.value).toBe('hello');
    });

    it('"$.key === \'value\'" -> EQUALS, value: "value" (strict equality)', () => {
      const pred = parsedPredicate("$.key === 'value'");
      expect(pred.key).toBe('$.key');
      expect(pred.operator).toBe(BinaryOperator.EQUALS);
      expect(pred.value).toBe('value');
    });

    it('"$.key !== \'value\'" -> NOT_EQUALS, value: "value"', () => {
      const pred = parsedPredicate("$.key !== 'value'");
      expect(pred.operator).toBe(BinaryOperator.NOT_EQUALS);
      expect(pred.value).toBe('value');
    });

    it('=== parsed before == (longest match first, regression for stray `= \'…\'`)', () => {
      // Regression guard: the old parser split at the first `==` inside `===`,
      // leaving `= 'claude-code'` as the value and silently breaking mode routing.
      const pred = parsedPredicate("$.event.data.payload.mode === 'claude-code'");
      expect(pred.value).toBe('claude-code');
      expect(pred.value).not.toContain('=');
    });

    it('path references: "$.a == $.b" -> value kept as "$.b"', () => {
      const pred = parsedPredicate('$.a == $.b');
      expect(pred.value).toBe('$.b');
    });

    it('empty expression -> undefined predicate (else branch)', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [{ if: '', steps: [{ type: 'action', action: 'x' }] }],
      }]);
      const result = compile(dsl);
      const switchNode = findEntity(result.entity, (e: any) => e.nodeType === 'switch');
      expect(switchNode.conditions[0].predicate).toBeUndefined();
    });
  });
});
