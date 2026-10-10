// Which build's data a command is pointed at.
//
// `-d`, `-b` and `--production` are `--build` shorthands now: they keep working and change what they
// *mean*, a build rather than an environment. The two spellings have to agree, because a reader who learned
// `--build` on `abuddy dev` should not have to learn a second one here — and because this was the half of
// the vocabulary change with an open question in it, where the same word selecting a different axis per
// command was the symptom.
import { describe, expect, it } from 'vitest';
import { APP_ENVS } from '@abuddy/sdk/env';
import { parseTargetEnv } from '../src/utils';

describe('which build a command reads', () => {
  it('is production when nothing says otherwise', () => {
    expect(parseTargetEnv([])).toEqual({ env: 'production', args: [] });
  });

  it('takes --build by name, inline or as the next argument', () => {
    expect(parseTargetEnv(['--build', 'development']).env).toBe('development');
    expect(parseTargetEnv(['--build=beta']).env).toBe('beta');
  });

  /**
   * The shorthands and the long form are one answer. Mutation: map `-b` to `development` and this fails on
   * the pair rather than on either half, which is what says they are held together rather than separately.
   */
  it('reads a shorthand as the build it is short for', () => {
    for (const [flags, build] of [
      [['-d'], 'development'], [['--dev'], 'development'],
      [['-b'], 'beta'], [['--beta'], 'beta'],
      [['--production'], 'production'],
    ] as const) {
      expect(parseTargetEnv([...flags]).env, flags.join(' ')).toBe(build);
      expect(parseTargetEnv(['--build', build]).env, `--build ${build}`).toBe(build);
    }
  });

  it('leaves every other argument in place and in order', () => {
    expect(parseTargetEnv(['my-pack', '-b', '--force']).args).toEqual(['my-pack', '--force']);
    expect(parseTargetEnv(['my-pack', '--build', 'beta', '--force']).args).toEqual(['my-pack', '--force']);
  });

  /**
   * A build this command cannot read is named, with what it can — where the old flags could not express a
   * wrong value at all, so a reader who guessed `--build nightly` would have had it silently forwarded to
   * whatever took the leftovers.
   */
  it('refuses a name that is not a build, and says which are', () => {
    expect(() => parseTargetEnv(['--build', 'nightly'])).toThrow(/Unknown build "nightly"/);
    for (const env of APP_ENVS) expect(() => parseTargetEnv(['--build', env])).not.toThrow();
  });

  it('refuses a --build with nothing after it', () => {
    expect(() => parseTargetEnv(['--build'])).toThrow(/needs a build name/);
  });

  /**
   * It names a **build**, never a profile. A build keeps its own default storage and `--profile` is the one
   * override, so a profile arriving here would be the fusion the whole change exists to end — and `db`'s
   * own parser is where `--profile` is read.
   */
  it('does not take a profile', () => {
    expect(parseTargetEnv(['--profile', 'probe']).args).toEqual(['--profile', 'probe']);
    expect(parseTargetEnv(['--profile', 'probe']).env).toBe('production');
  });
});
