import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The version of the AgentBuddy a test launches: a checkout's package.json, or the app package
 * inside a packaged build (macOS Contents/Resources/app, Windows and Linux resources/app).
 */
export function appVersion(app: { kind: 'source'; root: string } | { kind: 'packaged'; executable: string }): string | undefined {
  const candidates = app.kind === 'source'
    ? [path.join(app.root, 'package.json')]
    : [
      path.join(path.dirname(app.executable), '..', 'Resources', 'app', 'package.json'),
      path.join(path.dirname(app.executable), 'resources', 'app', 'package.json'),
    ];
  for (const file of candidates) {
    try {
      const { version } = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (typeof version === 'string') return version;
    } catch {}
  }
  return undefined;
}
