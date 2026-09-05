import { stepRegistry } from '@abuddy/sdk/steps';
import { listenerTrigger } from '../../src/steps/listener';
import { scheduleTrigger } from '../../src/steps/schedule';

beforeEach(() => {
  stepRegistry.clear();
});

describe('listener trigger definition', () => {
  it('has correct type and kind', () => {
    expect(listenerTrigger.type).toBe('listener');
    expect(listenerTrigger.kind).toBe('trigger');
  });

  it('uses "event" as trackField', () => {
    expect(listenerTrigger.trigger!.trackField).toBe('event');
  });

  it('is not persistent', () => {
    expect(listenerTrigger.trigger!.persistent).toBe(false);
  });

  it('declares eventType and scope as queryFields', () => {
    expect(listenerTrigger.trigger!.queryFields).toEqual(['eventType', 'scope']);
  });

  describe('compile', () => {
    const compile = listenerTrigger.trigger!.compile;

    it('compiles a first track with entry scope', () => {
      const result = compile(
        { event: 'user.login', label: 'Login Listener', isFirstTrack: true },
        'node-1', 1000, 'flow:track:0',
      );

      expect(result).toMatchObject({
        id: 'node-1',
        nodeType: 'listener',
        label: 'Login Listener',
        trackKey: 'flow:track:0',
        scope: 'entry',
        eventType: 'user.login',
        createdAt: 1000,
      });
    });

    it('compiles a non-first track with global scope', () => {
      const result = compile(
        { event: 'file.changed', isFirstTrack: false },
        'node-2', 2000, 'flow:track:1',
      );

      expect(result).toMatchObject({
        scope: 'global',
        eventType: 'file.changed',
      });
    });

    it('defaults isFirstTrack=false to global scope', () => {
      const result = compile(
        { event: 'some.event' },
        'node-3', 3000, 'flow:track:2',
      );

      expect(result).toMatchObject({ scope: 'global' });
    });

    it('falls back label to event name', () => {
      const result = compile(
        { event: 'my.event' },
        'node-4', 4000, 'flow:track:3',
      );

      expect(result).toMatchObject({ label: 'my.event' });
    });

    it('falls back label to "Listener" when no event or label', () => {
      const result = compile({}, 'node-5', 5000, 'flow:track:4');

      expect(result).toMatchObject({ label: 'Listener' });
    });
  });

  describe('decompile', () => {
    const decompile = listenerTrigger.trigger!.decompile;

    it('extracts event from eventType', () => {
      expect(decompile({ eventType: 'user.login' })).toEqual({ event: 'user.login' });
    });

    it('falls back to label', () => {
      expect(decompile({ label: 'My Listener' })).toEqual({ event: 'My Listener' });
    });

    it('falls back to "unknown"', () => {
      expect(decompile({})).toEqual({ event: 'unknown' });
    });
  });

  describe('fe facet', () => {
    it('has trigger category and correct color', () => {
      expect(listenerTrigger.fe!.nodeConfig.category).toBe('trigger');
      expect(listenerTrigger.fe!.colorKey).toBe('blue');
    });

    it('has no-input connection rules', () => {
      expect(listenerTrigger.fe!.nodeConfig.connectionRules).toEqual({ inputs: 0, outputs: -1 });
    });

    it('provides defaults', () => {
      expect(listenerTrigger.fe!.defaults).toEqual({ scope: 'global', eventType: '' });
    });
  });
});

describe('schedule trigger definition', () => {
  it('has correct type and kind', () => {
    expect(scheduleTrigger.type).toBe('schedule');
    expect(scheduleTrigger.kind).toBe('trigger');
  });

  it('uses "schedule" as trackField', () => {
    expect(scheduleTrigger.trigger!.trackField).toBe('schedule');
  });

  it('is persistent', () => {
    expect(scheduleTrigger.trigger!.persistent).toBe(true);
  });

  it('declares cronExpression as queryField', () => {
    expect(scheduleTrigger.trigger!.queryFields).toEqual(['cronExpression']);
  });

  describe('compile', () => {
    const compile = scheduleTrigger.trigger!.compile;

    it('compiles a schedule track', () => {
      const result = compile(
        { schedule: '0 * * * *', label: 'Hourly' },
        'sched-1', 1000, 'flow:track:0',
      );

      expect(result).toMatchObject({
        id: 'sched-1',
        nodeType: 'schedule',
        label: 'Hourly',
        cronExpression: '0 * * * *',
        trackKey: 'flow:track:0',
        createdAt: 1000,
      });
    });

    it('defaults label to "Schedule"', () => {
      const result = compile(
        { schedule: '*/5 * * * *' },
        'sched-2', 2000, 'flow:track:1',
      );

      expect(result).toMatchObject({ label: 'Schedule' });
    });
  });

  describe('decompile', () => {
    const decompile = scheduleTrigger.trigger!.decompile;

    it('extracts schedule from cronExpression', () => {
      expect(decompile({ cronExpression: '0 * * * *' })).toEqual({ schedule: '0 * * * *' });
    });
  });

  describe('validate', () => {
    const validate = scheduleTrigger.trigger!.validate!;

    it('accepts a valid cron expression', () => {
      expect(validate({ cronExpression: '0 * * * *' })).toEqual({ valid: true, errors: [] });
    });

    it('accepts a six-field cron expression', () => {
      expect(validate({ cronExpression: '*/5 * * * * *' })).toEqual({ valid: true, errors: [] });
    });

    it('rejects missing cronExpression', () => {
      const result = validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: cronExpression');
    });

    it('rejects empty cronExpression', () => {
      const result = validate({ cronExpression: '  ' });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid cron expression', () => {
      const result = validate({ cronExpression: 'not a cron' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid cron expression');
    });
  });

  describe('fe facet', () => {
    it('has trigger category and cyan color', () => {
      expect(scheduleTrigger.fe!.nodeConfig.category).toBe('trigger');
      expect(scheduleTrigger.fe!.colorKey).toBe('cyan');
    });

    it('provides cronExpression default', () => {
      expect(scheduleTrigger.fe!.defaults).toEqual({ cronExpression: '0 * * * *' });
    });
  });
});

describe('step registry integration', () => {
  beforeEach(() => {
    stepRegistry.register(listenerTrigger);
    stepRegistry.register(scheduleTrigger);
  });

  it('recognizes both as triggers', () => {
    expect(stepRegistry.isTrigger('listener')).toBe(true);
    expect(stepRegistry.isTrigger('schedule')).toBe(true);
  });

  it('does not treat regular steps as triggers', () => {
    stepRegistry.register({ type: 'action', kind: 'step' });
    expect(stepRegistry.isTrigger('action')).toBe(false);
  });

  it('triggers() returns both trigger definitions', () => {
    const triggers = stepRegistry.triggers();
    const types = triggers.map(t => t.type);
    expect(types).toContain('listener');
    expect(types).toContain('schedule');
  });

  it('getTrigger returns the trigger facet', () => {
    const facet = stepRegistry.getTrigger('listener');
    expect(facet).toBeDefined();
    expect(facet!.trackField).toBe('event');
  });

  it('getTrigger returns undefined for non-triggers', () => {
    stepRegistry.register({ type: 'action', kind: 'step' });
    expect(stepRegistry.getTrigger('action')).toBeUndefined();
  });

  it('getFE returns FE facet for triggers', () => {
    expect(stepRegistry.getFE('listener')?.colorKey).toBe('blue');
    expect(stepRegistry.getFE('schedule')?.colorKey).toBe('cyan');
  });

  it('compile/decompile roundtrip for listener', () => {
    const facet = stepRegistry.getTrigger('listener')!;
    const compiled = facet.compile(
      { event: 'test.event', label: 'Test', isFirstTrack: true },
      'id-1', 1000, 'flow:track:0',
    );
    const decompiled = facet.decompile(compiled);
    expect(decompiled).toEqual({ event: 'test.event' });
  });

  it('compile/decompile roundtrip for schedule', () => {
    const facet = stepRegistry.getTrigger('schedule')!;
    const compiled = facet.compile(
      { schedule: '0 9 * * MON', label: 'Monday 9am' },
      'id-2', 2000, 'flow:track:0',
    );
    const decompiled = facet.decompile(compiled);
    expect(decompiled).toEqual({ schedule: '0 9 * * MON' });
  });

  it('persistent flag differentiates listener from schedule', () => {
    const listenerFacet = stepRegistry.getTrigger('listener')!;
    const scheduleFacet = stepRegistry.getTrigger('schedule')!;
    expect(listenerFacet.persistent).toBe(false);
    expect(scheduleFacet.persistent).toBe(true);
  });
});
