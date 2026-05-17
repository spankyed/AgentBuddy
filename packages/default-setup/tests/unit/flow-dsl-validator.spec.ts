import { validate } from '../../build/flow-dsl-validator';

describe('flow DSL validator', () => {
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
