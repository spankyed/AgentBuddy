import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import getReleasePlan from '@changesets/get-release-plan';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/published-packages';

/** The versions Changesets assigns the published packages, from the repo's manifests and config. */
const PUBLISHED = { 'abuddy-ears': '@abuddy/ears', 'abuddy-sdk': '@abuddy/sdk', 'abuddy-ui': '@abuddy/ui', 'abuddy-cli': '@abuddy/cli', 'abuddy-testing': '@abuddy/testing' };

let scratch: string | undefined;
afterEach(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

async function releasePlan(changeset: string): Promise<Record<string, string>> {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-release-plan-'));
  fs.writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(scratch, '.changeset'));
  fs.copyFileSync(path.join(REPO_ROOT, '.changeset', 'config.json'), path.join(scratch, '.changeset', 'config.json'));
  fs.writeFileSync(path.join(scratch, '.changeset', 'change.md'), changeset);
  // Every workspace manifest: private workspace packages depend on the published ones too
  for (const dir of fs.readdirSync(path.join(REPO_ROOT, 'packages'))) {
    if (!fs.existsSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'))) continue;
    fs.mkdirSync(path.join(scratch, 'packages', dir), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), path.join(scratch, 'packages', dir, 'package.json'));
  }
  const plan = await getReleasePlan(scratch);
  return Object.fromEntries(plan.releases.filter((r) => r.name.startsWith('@abuddy/') && r.name !== '@abuddy/host').map((r) => [r.name, r.newVersion]));
}

describe('release plan', () => {
  it('a minor SDK change moves the fixed group one minor, not to 1.0.0', async () => {
    const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'abuddy-sdk', 'package.json'), 'utf-8')).version as string;
    const [major, minor] = current.split('.').map(Number);
    const next = `${major}.${minor + 1}.0`;
    const versions = await releasePlan(`---\n'@abuddy/sdk': minor\n---\n\nA change\n`);
    expect(versions).toEqual(Object.fromEntries(Object.values(PUBLISHED).map((name) => [name, next])));
  });
});
