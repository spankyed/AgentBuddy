import * as fs from 'node:fs';
import * as path from 'node:path';

/** Stamped into the published bundle (scripts/bundle-package.ts): the AgentBuddy version it was built with */
declare const __ABUDDY_APP_VERSION__: string | undefined;

/**
 * The AgentBuddy version this CLI was built with, whose data it reads and writes: the stamped version in the
 * published bundle, the checkout's root package.json when run from source
 */
export function supportedAppVersion(): string {
  if (typeof __ABUDDY_APP_VERSION__ === 'string') return __ABUDDY_APP_VERSION__;
  const rootManifest = path.resolve(import.meta.dirname, '..', '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(rootManifest, 'utf-8')).version;
}
