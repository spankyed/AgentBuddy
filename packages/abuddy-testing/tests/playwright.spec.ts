import { describe, expect, it } from 'vitest';
import {
  defineDriveConfig,
  definePackE2EConfig,
} from '../src/playwright.ts';

/**
 * The two config helpers, one per kind of run, and what each takes a pack's word on.
 *
 * Both take it last, because nothing reads their settings back. A third helper stood beside them while a
 * session was an HTTP server with a handshake to protect; a session is a connection now, and there is no
 * setting left that a pack changing it would break.
 */

describe("a pack's E2E config", () => {
  it('holds the settings the four copies used to restate', () => {
    expect(definePackE2EConfig()).toMatchObject({
      testDir: 'tests/e2e',
      timeout: 60_000,
      workers: 1,
      outputDir: 'tests/results',
    });
  });

  it("takes the pack's own word last, so a suite can add to it", () => {
    const config = definePackE2EConfig({ retries: 2, use: { screenshot: 'on' } });

    expect(config.retries).toBe(2);
    expect(config.use).toEqual({ screenshot: 'on' });
    // and still carries what it did not override
    expect(config.timeout).toBe(60_000);
  });

  it('lets a suite that genuinely needs longer say so', () => {
    expect(definePackE2EConfig({ timeout: 120_000 }).timeout).toBe(120_000);
  });
});

describe('a driving config', () => {
  it('collects the scripts beside it, with no timeout: someone is watching', () => {
    expect(defineDriveConfig()).toMatchObject({
      testDir: '.',
      testMatch: '**/*.ts',
      workers: 1,
      timeout: 0,
      outputDir: 'results',
    });
  });

  /**
   * The one thing a pack cannot undo. A driving run that collected the engine's session would start it and
   * hang, waiting for a request nobody watching has a reason to send — and before this helper the only
   * thing preventing it was the session's `.mts` extension falling outside the default `**\/*.ts` glob.
   */
  it('ignores the engine session however testMatch is widened', () => {
    const config = defineDriveConfig({ testMatch: '**/*.{ts,mts}' });

    expect(config.testMatch).toBe('**/*.{ts,mts}');
    expect(config.testIgnore).toContain('engine-session.mts');
  });

  it("keeps a pack's own testIgnore beside the session, rather than replacing it", () => {
    expect(defineDriveConfig({ testIgnore: 'scratch.ts' }).testIgnore)
      .toEqual(['engine-session.mts', 'playwright.config.ts', 'scratch.ts']);
  });

  it('takes a testIgnore in any of the shapes Playwright accepts', () => {
    expect(defineDriveConfig({ testIgnore: ['a.ts', 'b.ts'] }).testIgnore)
      .toEqual(['engine-session.mts', 'playwright.config.ts', 'a.ts', 'b.ts']);
    expect(defineDriveConfig({ testIgnore: /scratch/ }).testIgnore)
      .toEqual(['engine-session.mts', 'playwright.config.ts', /scratch/]);
  });
});

