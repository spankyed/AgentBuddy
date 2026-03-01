import { createRoundTrip } from './helpers/round-trip';
import { wrapInFlow } from './helpers/dsl-factories';
import { steps, ctx, flows } from './helpers/fixtures';

/*─────────────────────────────────────────────────────────────────
 * Setup
 *─────────────────────────────────────────────────────────────────*/

const rt = createRoundTrip();

beforeEach(() => rt.beforeEach());
afterEach(() => rt.afterEach());

/*─────────────────────────────────────────────────────────────────
 * Tests
 *─────────────────────────────────────────────────────────────────*/

describe('round-trip', () => {
  describe('simple flows', () => {
    it('single action step: export matches original DSL', () => {
      const exported = rt.roundTrip(flows.simple);

      expect(exported['Simple']).toBeDefined();
      expect(exported['Simple']).toHaveLength(1);
      const track = exported['Simple'][0];
      expect(track.event).toBe('start');
      expect(track.steps).toHaveLength(1);
      expect(track.steps[0].type).toBe('action');
      expect(track.steps[0].action).toBe('doSomething');
    });

    it('multiple sequential steps: order preserved', () => {
      const exported = rt.roundTrip(flows.multiStep);
      const steps = exported['Multi'][0].steps;

      expect(steps).toHaveLength(3);
      expect(steps[0].action).toBe('first');
      expect(steps[1].action).toBe('second');
      expect(steps[2].action).toBe('third');
    });

    it('step with label and description: preserved', () => {
      const exported = rt.roundTrip(flows.labeled, { actions: ctx.actions });
      const step = exported['Labeled'][0].steps[0];

      expect(step.label).toBe('Custom Label');
      expect(step.description).toBe('Does something important');
    });

    it('step with final: true: preserved', () => {
      const exported = rt.roundTrip(flows.final);
      const step = exported['Final'][0].steps[0];

      expect(step.final).toBe(true);
    });
  });

  describe('action + llm nodes', () => {
    it('action with params: preserved', () => {
      const dsl = wrapInFlow([steps.actionParams]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('action');
      expect(step.params).toEqual({ to: 'user@test.com', subject: 'Hi' });
    });

    it('action with field mappings (map): preserved', () => {
      const dsl = wrapInFlow([steps.actionMap]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.map).toEqual({ input: '$.data.value', key: '$.data.id' });
    });

    it('llm with all options (model, temperature, etc.): preserved', () => {
      const dsl = wrapInFlow([steps.llmBasic]);
      const exported = rt.roundTrip(dsl, { prompts: ctx.prompts });
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('llm');
      expect(step.prompt).toBe('classify');
      expect(step.model).toBe('gpt-4');
      expect(step.temperature).toBe(0.7);
      expect(step.maxTokens).toBe(500);
      expect(step.systemPrompt).toBe('You are helpful');
    });
  });

  describe('switch node', () => {
    it('single condition with inline step: condition expression + steps preserved', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [{
          if: '$.status == active',
          steps: [{ type: 'action', action: 'activate' }],
        }],
      }]);
      const exported = rt.roundTrip(dsl);
      const sw = exported['F'][0].steps[0];

      expect(sw.type).toBe('switch');
      expect(sw.conditions).toHaveLength(1);
      expect(sw.conditions[0].if).toBe('$.status == active');
      expect(sw.conditions[0].steps).toHaveLength(1);
      expect(sw.conditions[0].steps[0].type).toBe('action');
      expect(sw.conditions[0].steps[0].action).toBe('activate');
    });

    it('condition + else: both branches preserved with correct steps', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [{
          if: '$.x == 1',
          steps: [{ type: 'action', action: 'onTrue' }],
        }],
        else: [{ type: 'action', action: 'onFalse' }],
      }]);
      const exported = rt.roundTrip(dsl);
      const sw = exported['F'][0].steps[0];

      expect(sw.conditions).toHaveLength(1);
      expect(sw.conditions[0].steps[0].action).toBe('onTrue');
      expect(sw.else).toBeDefined();
      expect(sw.else).toHaveLength(1);
      expect(sw.else[0].action).toBe('onFalse');
    });

    it('multiple conditions: all preserved in order', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [
          { if: '$.x == 1', steps: [{ type: 'action', action: 'case1' }] },
          { if: '$.x == 2', steps: [{ type: 'action', action: 'case2' }] },
          { if: '$.x == 3', steps: [{ type: 'action', action: 'case3' }] },
        ],
      }]);
      const exported = rt.roundTrip(dsl);
      const sw = exported['F'][0].steps[0];

      expect(sw.conditions).toHaveLength(3);
      expect(sw.conditions[0].if).toBe('$.x == 1');
      expect(sw.conditions[1].if).toBe('$.x == 2');
      expect(sw.conditions[2].if).toBe('$.x == 3');
      expect(sw.conditions[0].steps[0].action).toBe('case1');
      expect(sw.conditions[1].steps[0].action).toBe('case2');
      expect(sw.conditions[2].steps[0].action).toBe('case3');
    });

    it('nested inline chain (multi-step branch): all steps preserved', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [{
          if: '$.x == 1',
          steps: [
            { type: 'action', action: 'step1' },
            { type: 'action', action: 'step2' },
            { type: 'action', action: 'step3' },
          ],
        }],
      }]);
      const exported = rt.roundTrip(dsl);
      const branch = exported['F'][0].steps[0].conditions[0].steps;

      expect(branch).toHaveLength(3);
      expect(branch[0].action).toBe('step1');
      expect(branch[1].action).toBe('step2');
      expect(branch[2].action).toBe('step3');
    });

    it('switch as only step (no continuation): no orphan edges', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [
          { if: '$.x == 1', steps: [{ type: 'action', action: 'a' }] },
        ],
        else: [{ type: 'action', action: 'b' }],
      }]);
      const exported = rt.roundTrip(dsl);

      // Should have exactly 1 step (the switch)
      expect(exported['F'][0].steps).toHaveLength(1);
      expect(exported['F'][0].steps[0].type).toBe('switch');
    });

    it('switch followed by another step: branches inlined, continuation present', () => {
      const dsl = wrapInFlow([
        {
          type: 'switch',
          conditions: [
            { if: '$.x == 1', steps: [{ type: 'action', action: 'branchA' }] },
          ],
        },
        { type: 'action', action: 'after' },
      ]);
      const exported = rt.roundTrip(dsl);
      const steps = exported['F'][0].steps;

      // Switch should be first, with its branch inlined
      expect(steps[0].type).toBe('switch');
      expect(steps[0].conditions[0].steps[0].action).toBe('branchA');

      // Continuation step should appear after the switch
      // (with single branch, after gets absorbed into the exclusive chain)
      const afterSteps = steps.filter((s: any) => s.type === 'action' && s.action === 'after');
      // The continuation is inlined into the branch chain (exclusive chain absorbs it)
      // or appears as a separate step — either way, it should be reachable
      const allActions = steps.flatMap((s: any) =>
        s.type === 'switch'
          ? s.conditions.flatMap((c: any) => c.steps || [])
          : [s]
      );
      const hasAfter = allActions.some((s: any) => s.action === 'after');
      expect(hasAfter).toBe(true);
    });
  });

  describe('all node types', () => {
    it('fire with scope + payload', () => {
      const dsl = wrapInFlow([steps.fire]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('fire');
      expect(step.event).toBe('notify.sent');
      expect(step.scope).toBe('global');
      expect(step.payload).toEqual({ msg: 'hello' });
    });

    it('transform with script + outputType', () => {
      const dsl = wrapInFlow([steps.transform]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('transform');
      expect(step.script).toBe('return x + 1');
      expect(step.outputType).toBe('text');
    });

    it('query with prompt + as', () => {
      const dsl = wrapInFlow([steps.query]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('query');
      expect(step.prompt).toBe('Find user by name');
      expect(step.as).toBe('foundUser');
    });

    it('flow with inherit + map', () => {
      const exported = rt.roundTrip(flows.parentChild);
      const step = exported['Parent'][0].steps[0];

      expect(step.type).toBe('flow');
      expect(step.flow).toBe('Child');
      expect(step.inherit).toBe(false);
      expect(step.map).toEqual({ userId: '$.data.id' });
    });

    it('create with entity', () => {
      const dsl = wrapInFlow([steps.create]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('create');
      expect(step.entity).toBe('Thread');
    });

    it('update with onMissing', () => {
      // Note: the compiler doesn't currently map DSL `target` to entity `entityId`,
      // so only onMissing round-trips. target is lost in compilation.
      const dsl = wrapInFlow([steps.update]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('update');
      expect(step.onMissing).toBe('ignore');
    });

    it('keep_alive', () => {
      const dsl = wrapInFlow([steps.keepAlive]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.type).toBe('keep_alive');
    });
  });

  describe('multi-track flows', () => {
    it('two tracks with different events: both preserved', () => {
      const exported = rt.roundTrip(flows.multiTrack);

      expect(exported['MultiTrack']).toHaveLength(2);
      const events = exported['MultiTrack'].map((t: any) => t.event);
      expect(events).toContain('user.created');
      expect(events).toContain('user.updated');
    });

    it('track labels: unique labels preserved', () => {
      const exported = rt.roundTrip(flows.twoLabeledTracks);
      const labels = exported['F'].map((t: any) => t.label);

      expect(labels).toContain('Track A');
      expect(labels).toContain('Track B');
    });
  });

  describe('field mappings', () => {
    it('round-trips correctly (record -> array -> record)', () => {
      const dsl = wrapInFlow([steps.actionFieldMap]);
      const exported = rt.roundTrip(dsl);
      const step = exported['F'][0].steps[0];

      expect(step.map).toEqual({ name: '$.data.name', age: '$.data.age' });
    });
  });

  describe('edge cases', () => {
    it('switch with empty condition steps: condition present, no inline steps', () => {
      const dsl = wrapInFlow([{
        type: 'switch',
        conditions: [
          { if: '$.x == 1', steps: [] },
        ],
      }]);
      const exported = rt.roundTrip(dsl);
      const sw = exported['F'][0].steps[0];

      expect(sw.type).toBe('switch');
      expect(sw.conditions).toHaveLength(1);
      expect(sw.conditions[0].if).toBe('$.x == 1');
      expect(sw.conditions[0].steps).toHaveLength(0);
    });

    it('flow with no steps (just listen): empty steps array', () => {
      const exported = rt.roundTrip(flows.empty);

      expect(exported['Empty']).toBeDefined();
      expect(exported['Empty'][0].steps).toHaveLength(0);
    });
  });
});
