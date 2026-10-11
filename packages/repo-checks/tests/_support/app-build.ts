import fs from 'node:fs';
import path from 'node:path';
import { APP_WORKSPACES, sealBuildSession } from '../../../../build/build-metadata.ts';

/** Stand-ins for successful bundler output, using the real build receipt. */
export function completeBuildFixture(root: string): void {
  for (const workspace of APP_WORKSPACES) {
    const dist = path.join(root, 'packages', workspace, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.js'), workspace);
  }
  sealBuildSession(root);
}
