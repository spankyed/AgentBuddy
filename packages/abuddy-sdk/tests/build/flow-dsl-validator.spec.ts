import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validate } from '../../src/build/compilers/flow-dsl-validator';
import { stepRegistry } from '../../src/steps/registry';

function registerBaseTriggers() {
  stepRegistry.register({
    type: 'listener',
    kind: 'trigger',
    trigger: {
      trackField: 'event',
      compile: () => ({}),
      decompile: () => ({}),
    },
  });
  stepRegistry.register({
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
  });
}

describe('flow DSL validator', () => {
  describe('schedule tracks', () => {
    beforeEach(() => registerBaseTriggers());
    afterEach(() => stepRegistry.clear());

    it('allows root flows with only a schedule track', () => {
      const result = validate({
        'Scheduled Root': {
          root: true,
          tracks: [
            { schedule: '0 * * * *', exits: [[]] },
          ],
        },
      });

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
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('still rejects multiple root flows', () => {
      const result = validate({
        'Root A': { root: true, tracks: [{ event: 'a', exits: [[]] }] },
        'Root B': { root: true, tracks: [{ schedule: '0 * * * *', exits: [[]] }] },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.message.includes('Multiple flows marked as root'))).toBe(true);
    });
  });

  describe('track validation with registry', () => {
    beforeEach(() => registerBaseTriggers());
    afterEach(() => stepRegistry.clear());

    it('accepts event tracks when listener is registered', () => {
      const result = validate({
        'Flow': [{ event: 'test.event', exits: [[]] }],
      });

      expect(result.valid).toBe(true);
    });

    it('accepts schedule tracks when schedule is registered', () => {
      const result = validate({
        'Flow': [{ schedule: '0 * * * *', exits: [[]] }],
      });

      expect(result.valid).toBe(true);
    });

    it('rejects tracks with no trigger field', () => {
      const result = validate({
        'Flow': [{ exits: [[]] }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('"event"');
      expect(result.errors[0].message).toContain('"schedule"');
    });

    it('rejects tracks with multiple trigger fields', () => {
      const result = validate({
        'Flow': [{ event: 'test', schedule: '0 * * * *', exits: [[]] }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('multiple trigger fields');
    });

    it('runs trigger-specific validateTrack', () => {
      stepRegistry.clear();
      stepRegistry.register({
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
      });

      const result = validate({
        'Flow': [{ webhook: 'http://insecure.com', exits: [[]] }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('HTTPS'))).toBe(true);
    });

    it('rejects trigger types used as step types', () => {
      const result = validate({
        'Flow': [{
          event: 'test',
          exits: [[{ type: 'listener' }]],
        }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Trigger types belong at the track level'))).toBe(true);
    });
  });

  describe('empty registry', () => {
    beforeEach(() => stepRegistry.clear());

    it('throws when no triggers are registered', () => {
      expect(() => validate({
        'Flow': [{ event: 'test.event', exits: [[]] }],
      })).toThrow('No trigger types registered');
    });

    it('validates cron via validateTrack when schedule trigger is registered', () => {
      registerBaseTriggers();
      const result = validate({
        'Flow': [{ schedule: 'not-valid', exits: [[]] }],
      });

      expect(result.valid).toBe(false);
      stepRegistry.clear();
    });
  });
});
