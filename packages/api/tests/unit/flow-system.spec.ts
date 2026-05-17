import { isPersistentTriggerFlow, shouldCompleteFlow } from '@/systems/brain/flow-completion';

describe('flow system completion semantics', () => {
  describe('isPersistentTriggerFlow', () => {
    it('treats entry-only flows as finite', () => {
      expect(isPersistentTriggerFlow([
        { triggerType: 'listener', scope: 'entry' },
      ])).toBe(false);
    });

    it('treats schedule-triggered flows as persistent', () => {
      expect(isPersistentTriggerFlow([
        { triggerType: 'schedule' },
      ])).toBe(true);
    });

    it('keeps non-entry listener flows finite', () => {
      expect(isPersistentTriggerFlow([
        { triggerType: 'listener', scope: 'global' },
        { triggerType: 'listener', scope: 'local' },
      ])).toBe(false);
    });
  });

  describe('shouldCompleteFlow', () => {
    it('completes finite entry-only flows when all active tracks drain', () => {
      expect(shouldCompleteFlow({
        final: false,
        allTracksDrained: true,
        hasPersistentTriggers: false,
      })).toBe(true);
    });

    it('keeps persistent trigger flows alive when a fired track drains', () => {
      expect(shouldCompleteFlow({
        final: false,
        allTracksDrained: true,
        hasPersistentTriggers: true,
      })).toBe(false);
    });

    it('still completes persistent trigger flows on explicit final completion', () => {
      expect(shouldCompleteFlow({
        final: true,
        allTracksDrained: false,
        hasPersistentTriggers: true,
      })).toBe(true);
    });
  });
});
