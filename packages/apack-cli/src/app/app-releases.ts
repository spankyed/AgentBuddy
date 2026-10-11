// The desktop app's own releases on GitHub: listing them, and fetching an asset against its published sha256.
//
// Shared by the two things that install a build — `ensureBetaApp`, which caches one for `apack test`, and
// `apack upgrade`, which replaces the app in /Applications. Both want the same three steps (list, pick,
// fetch verified) and differ only in which release they pick and where the app lands.
//
// **Anonymous by default.** The repo is public, so listing releases and downloading an asset need no
// credential; a `GITHUB_TOKEN`/`GH_TOKEN` is used when one happens to be set, for the higher rate limit
// (60 requests an hour unauthenticated, 5000 with). Nothing here requires one, so nothing here is a reason
// to keep a token in the environment.
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Octokit } from '@octokit/rest';

/** Desktop app releases, published by .github/workflows/build-mac.yml. */
export const APP_RELEASES_REPO = { owner: 'spankyed', repo: 'apack' };

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: ReleaseAsset[];
}

/** Every release, newest first as GitHub orders them. Injected in tests; this is the real one. */
export async function listAppReleases(): Promise<Release[]> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN, userAgent: 'apack-cli' });
  return octokit.paginate(octokit.rest.repos.listReleases, { ...APP_RELEASES_REPO, per_page: 100 }) as Promise<Release[]>;
}

export async function httpDownload(url: string): Promise<Readable> {
  const response = await fetch(url, { headers: { 'User-Agent': 'apack-cli' } });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  return Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
}

async function readText(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

/** How a download gets its bytes, so a test supplies its own without reaching the network */
export type Download = (url: string) => Promise<Readable>;

/**
 * Writes `asset` to `to`, hashing as it streams, and refuses the file when the digest is not the one
 * `checksum` publishes.
 *
 * Hashed in the pipeline rather than by re-reading the file, so a download that does not match is never a
 * file anything could mistake for a good one — the throw happens before any caller is handed the path.
 */
export async function downloadVerified(options: {
  asset: ReleaseAsset;
  checksum: ReleaseAsset;
  to: string;
  download?: Download;
}): Promise<void> {
  const download = options.download ?? httpDownload;
  const expected = (await readText(await download(options.checksum.browser_download_url))).trim().split(/\s+/)[0];

  const hash = createHash('sha256');
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(await download(options.asset.browser_download_url), hashing, fs.createWriteStream(options.to));

  const actual = hash.digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${options.asset.name}: expected ${expected}, got ${actual}`);
  }
}
