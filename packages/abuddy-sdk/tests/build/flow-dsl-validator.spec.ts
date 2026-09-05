import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validate } from '../../src/build/compilers/flow-dsl-validator';
import type { StepDefinition } from '../../src/steps/types';
import { stepRegistry } from '../../src/steps/registry';

const baseTriggers: StepDefinition[] = [
  {
    type: 'listener',
    kind: 'trigger',
    trigger: {
      trackField: 'event',
      compile: () => ({}),
      decompile: () => ({}),
    },
  },
  {
    type: 'schedule',
    kind: 'trigger',
    trigger: {
      trackField: 'schedule',
      compile: () => ({}),
      decompile: () => ({}),
      validateTrack(track) {
        const cron = (track as any).schedule as string | undefined;
        if (!cron?.trim()) return { valid: false, errors: ['Missing schedule'] };
        const parts = cron.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          return { valid: false, errors: ['Invalid cron expression'] };
        }
        return { valid: true, errors: [] };
      },
    },
  },
];

describe('flow DSL validator', () => {
  afterEach(() => stepRegistry.clear());

  describe('schedule tracks', () => {
    it('allows root flows with only a schedule track', () => {
      const result = validate({
        'Scheduled Root': {
          root: true,
          tracks: [{ schedule: '0 * * * *', exits: [[]] }],
        },
      }, { steps: baseTriggers });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('allows root flows with a schedule track before an event track', () => {
      const result = validate({
        'Schedule First Root': {
          root: true,
          tracks: [
            { schedule: '0 * * * *', exits: [[]] },
            { event: 'manual.start', exits: [[]] },
          ],
        },
      }, { steps: baseTriggers });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('still rejects multiple root flows', () => {
      const result = validate({
        'Root A': { root: true, tracks: [{ event: 'a', exits: [[]] }] },
        'Root B': { root: true, tracks: [{ schedule: '0 * * * *', exits: [[]] }] },
      }, { steps: baseTriggers });

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.message.includes('Multiple flows marked as root'))).toBe(true);
    });
  });

  describe('track validation', () => {
    it('accepts event tracks', () => {
      const result = validate({
        'Flow': [{ event: 'test.event', exits: [[]] }],
      }, { steps: baseTriggers });

      expect(result.valid).toBe(true);
    });

    it('accepts schedule tracks', () => {
      const result = validate({
        'Flow': [{ schedule: '0 * * * *', exits: [[]] }],
      }, { steps: baseTriggers });

      expect(result.valid).toBe(true);
    });

    it('rejects tracks with no trigger field', () => {
      const result = validate({
        'Flow': [{ exits: [[]] }],
      }, { steps: baseTriggers });

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('"event"');
      expect(result.errors[0].message).toContain('"schedule"');
    });

    it('rejects tracks with multiple trigger fields', () => {
      const result = validate({
        'Flow': [{ event: 'test', schedule: '0 * * * *', exits: [[]] }],
      }, { steps: baseTriggers });

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('multiple trigger fields');
    });

    it('runs trigger-specific validateTrack', () => {
      const webhookTrigger: StepDefinition = {
        type: 'custom-trigger',
        kind: 'trigger',
        trigger: {
          trackField: 'webhook',
          compile: () => ({}),
          decompile: () => ({}),
          validateTrack(track) {
            const url = (track as any).webhook as string;
            if (!url.startsWith('https://')) {
              return { valid: false, errors: ['Webhook URL must use HTTPS'] };
            }
            return { valid: true, errors: [] };
          },
        },
      };

      const result = validate({
        'Flow': [{ webhook: 'http://insecure.com', exits: [[]] }],
      }, { steps: [webhookTrigger] });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('HTTPS'))).toBe(true);
    });

    it('rejects trigger types used as step types', () => {
      const result = validate({
        'Flow': [{
          event: 'test',
          exits: [[{ type: 'listener' }]],
        }],
      }, { steps: baseTriggers });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Trigger types belong at the track level'))).toBe(true);
    });

    it('validates cron via validateTrack', () => {
      const result = validate({
        'Flow': [{ schedule: 'not-valid', exits: [[]] }],
      }, { steps: baseTriggers });

      expect(result.valid).toBe(false);
    });
  });

  describe('registry fallback', () => {
    it('falls back to step registry when options.steps is not provided', () => {
      for (const step of baseTriggers) stepRegistry.register(step);

      const result = validate({
        'Flow': [{ event: 'test.event', exits: [[]] }],
      });

      expect(result.valid).toBe(true);
    });

    it('throws when neither options.steps nor registry has triggers', () => {
      expect(() => validate({
        'Flow': [{ event: 'test.event', exits: [[]] }],
      })).toThrow('No trigger types provided');
    });
  });
});
