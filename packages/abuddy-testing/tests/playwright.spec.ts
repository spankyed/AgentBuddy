import { describe, expect, it } from 'vitest';
import {
  defineDriveConfig,
  defineEngineConfig,
  definePackE2EConfig,
  type EngineConfigOptions,
} from '../src/playwright.ts';

/**
 * The three config helpers, and the one asymmetry between them worth a test.
 *
 * `definePackE2EConfig` and `defineDriveConfig` take a pack's word last, because nothing reads their
 * settings back. `defineEngineConfig` does not: four of its settings are the session's HTTP handshake, and
 * a pack that changed one would get a session that fails confusingly rather than one configured its way.
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

describe("the engine's serving config", () => {
  it('names the session exactly, so no driving script joins a serving run', () => {
    expect(defineEngineConfig()).toMatchObject({
      testDir: '.',
      testMatch: 'engine-session.mts',
      workers: 1,
      timeout: 0,
      outputDir: 'results',
    });
  });

  it('takes what the handshake does not depend on', () => {
    expect(defineEngineConfig({ reporter: 'dot' }).reporter).toBe('dot');
  });

  /**
   * The compile error is the real guard — `EngineConfigOptions` omits these four, so a pack setting one
   * does not build. This covers the other half: a caller that reached past the type, through a cast or
   * from JavaScript, still cannot break a session.
   *
   * Mutation check: move the handshake above `...options` in `defineEngineConfig` and this fails on all
   * four, which is what says the spread order is load-bearing rather than incidental.
   */
  it('wins over a caller that reached past the type', () => {
    const past = { testMatch: '**/*.mts', workers: 4, timeout: 30_000, outputDir: 'elsewhere' };
    const config = defineEngineConfig(past as EngineConfigOptions);

    expect(config.testMatch).toBe('engine-session.mts');
    expect(config.workers).toBe(1);
    expect(config.timeout).toBe(0);
    expect(config.outputDir).toBe('results');
  });

  it('does not let the four be set through the type at all', () => {
    // @ts-expect-error a session that times out is a session that dies mid-request
    expect(defineEngineConfig({ timeout: 30_000 }).timeout).toBe(0);
    // @ts-expect-error two workers means two apps on one data dir, which Electron refuses
    expect(defineEngineConfig({ workers: 4 }).workers).toBe(1);
    // @ts-expect-error the marker and the log are read from this directory
    expect(defineEngineConfig({ outputDir: 'elsewhere' }).outputDir).toBe('results');
    // @ts-expect-error nothing else selects the session
    expect(defineEngineConfig({ testMatch: '**/*.mts' }).testMatch).toBe('engine-session.mts');
  });
});
