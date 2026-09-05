import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validate } from '../../src/build/compilers/flow-dsl-validator';
import { stepRegistry } from '../../src/steps/registry';

describe('flow DSL validator', () => {
  describe('schedule tracks (no registry)', () => {
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
    beforeEach(() => {
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
          validate(node) {
            const cron = (node as any).schedule as string | undefined;
            if (!cron) return { valid: false, errors: ['Missing schedule'] };
            return { valid: true, errors: [] };
          },
        },
      });
    });

    afterEach(() => {
      stepRegistry.clear();
    });

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

    it('runs trigger-specific validation', () => {
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

  describe('fallback when registry is empty', () => {
    beforeEach(() => {
      stepRegistry.clear();
    });

    it('still accepts event tracks via fallback fields', () => {
      const result = validate({
        'Flow': [{ event: 'test.event', exits: [[]] }],
      });

      expect(result.valid).toBe(true);
    });

    it('still accepts schedule tracks via fallback fields', () => {
      const result = validate({
        'Flow': [{ schedule: '0 * * * *', exits: [[]] }],
      });

      expect(result.valid).toBe(true);
    });

    it('still validates cron expressions via fallback', () => {
      const result = validate({
        'Flow': [{ schedule: 'not-valid', exits: [[]] }],
      });

      expect(result.valid).toBe(false);
    });
  });
});
