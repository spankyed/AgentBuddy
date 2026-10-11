// Which release `apack upgrade` installs, and what it reads off the app already in /Applications.
//
// The two pure halves of the command. What is left — downloading, quitting the app, swapping the bundle —
// is `ditto`, an Apple Event and a rename, each of which is the system's to get right and none of which a
// unit test can observe without a real app installed.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installedVersion, pickAppRelease } from '../../src/commands/upgrade';

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${encodeURIComponent(name)}` });
const zipName = (product: string, version: string) => `${product}-${version}-mac-arm64.zip`;

const release = (version: string, { prerelease = false, product = 'apack', checksum = true, draft = false, fileVersion = version } = {}) => ({
  tag_name: `v${version}`,
  draft,
  prerelease,
  assets: [asset(zipName(product, fileVersion)), ...(checksum ? [asset(`${zipName(product, fileVersion)}.sha256`)] : [])],
});

describe('pickAppRelease', () => {
  it('takes the newest production release for the production channel', () => {
    const picked = pickAppRelease([release('0.3.14'), release('0.4.1'), release('0.4.0')], 'production');

    expect(picked?.version).toBe('0.4.1');
  });

  /**
   * The channels do not see each other's releases, which is what makes `-b` a choice rather than a
   * preference: a beta is always a higher version than the production release it came from, so a picker
   * that merely sorted would put every production user on beta.
   */
  it('leaves a prerelease to the beta channel, and a release to production', () => {
    const published = [
      release('0.4.2-beta.1', { prerelease: true, product: 'apack-Beta' }),
      release('0.4.1'),
    ];

    expect(pickAppRelease(published, 'production')?.version).toBe('0.4.1');
    expect(pickAppRelease(published, 'beta')?.version).toBe('0.4.2-beta.1');
  });

  // Each channel's artifacts carry its own product name, so a release holding only the other's is no answer
  it('ignores a release whose zip is the other channel\'s build', () => {
    const onlyBeta = [release('0.4.1', { product: 'apack-Beta' })];

    expect(pickAppRelease(onlyBeta, 'production')).toBeNull();
  });

  /**
   * Skipped rather than failed, and the older one still installs: a release that published a zip and no
   * checksum is unverifiable, which is a reason not to install *it* and not a reason to strand the user.
   */
  it('passes over an unverifiable release and takes the one before it', () => {
    const picked = pickAppRelease([release('0.4.2', { checksum: false }), release('0.4.1')], 'production');

    expect(picked?.version).toBe('0.4.1');
  });

  it('ignores a draft', () => {
    expect(pickAppRelease([release('0.9.0', { draft: true }), release('0.4.1')], 'production')?.version).toBe('0.4.1');
  });

  // A beta promoted from a production build carries that build's version in the zip, not the tag's
  it('reports the version the zip names rather than the tag', () => {
    const promoted = [release('0.5.0-beta.0', { prerelease: true, product: 'apack-Beta', fileVersion: '0.5.0' })];

    expect(pickAppRelease(promoted, 'beta')?.version).toBe('0.5.0');
  });

  it('answers nothing when the channel has published nothing', () => {
    expect(pickAppRelease([], 'production')).toBeNull();
  });
});

describe('installedVersion', () => {
  const dirs: string[] = [];
  const anApp = (plist?: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-upgrade-spec-'));
    dirs.push(dir);
    const app = path.join(dir, 'apack.app');
    fs.mkdirSync(path.join(app, 'Contents'), { recursive: true });
    if (plist !== undefined) fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), plist);
    return app;
  };

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the short version string out of the bundle', () => {
    const app = anApp(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleShortVersionString</key><string>0.4.1</string>
</dict></plist>`);

    expect(installedVersion(app)).toBe('0.4.1');
  });

  // Nothing installed is the ordinary first run, so it answers "none" rather than throwing
  it('answers nothing for an app that is not there', () => {
    expect(installedVersion(path.join(os.tmpdir(), 'apack-upgrade-absent.app'))).toBeNull();
  });

  /**
   * A bundle it cannot read is "no version", not a crash — and that is what makes the caller's `--force`
   * unnecessary for it: an unreadable version compares as absent, so the upgrade proceeds.
   */
  it('answers nothing for a bundle with an unreadable plist', () => {
    expect(installedVersion(anApp('not a plist'))).toBeNull();
  });
});
