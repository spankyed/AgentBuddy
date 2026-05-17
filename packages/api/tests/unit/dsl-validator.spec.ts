import { validate } from '@/systems/flows/dsl/validator';
import type { FlowDSL } from '@/systems/flows/dsl/types';

describe('validate', () => {
  describe('root schedule tracks', () => {
    it('allows root flows with only a schedule track', () => {
      const result = validate({
        'Scheduled Root': {
          root: true,
          tracks: [
            { schedule: '0 * * * *', exits: [[]] },
          ],
        },
      } as FlowDSL);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('allows six-field schedule tracks for second-level intervals', () => {
      const result = validate({
        'Second Interval Root': {
          root: true,
          tracks: [
            { schedule: '*/5 * * * * *', exits: [[]] },
          ],
        },
      } as FlowDSL);

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
      } as FlowDSL);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('still rejects multiple root flows', () => {
      const result = validate({
        'Root A': { root: true, tracks: [{ event: 'a', exits: [[]] }] },
        'Root B': { root: true, tracks: [{ schedule: '0 * * * *', exits: [[]] }] },
      } as FlowDSL);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.message.includes('Multiple flows marked as root'))).toBe(true);
    });
  });
});
