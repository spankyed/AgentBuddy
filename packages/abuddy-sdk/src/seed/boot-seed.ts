import * as fs from 'fs';
import * as crypto from 'crypto';
import { repository } from '../ears/index.js';
import { seedData, type SeedCounts, type SeedIncludeSet } from '../utils/index.js';
import { seedPath } from '../build/manifest.js';

export interface BootSeedConfig {
  artifacts: string[];
  compiledDir: string;
  getIncludeOverrides?: () => Record<string, SeedIncludeSet>;
}

function computeSeedHash(compiledDir: string, artifacts: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const name of artifacts) {
    const filePath = seedPath(compiledDir, name);
    if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex').slice(0, 16);
}

export function createBootSeed(config: BootSeedConfig): (options?: { verbose?: boolean }) => Record<string, SeedCounts> | null {
  const { artifacts, compiledDir, getIncludeOverrides } = config;
  const repo = repository as any;

  return function runBootSeed(options?: { verbose?: boolean }): Record<string, SeedCounts> | null {
    const log = options?.verbose ? console.log.bind(console) : () => {};
    const currentHash = computeSeedHash(compiledDir, artifacts);
    const storedHash = repo.settingsQueries.getInternalSettings().seedHash;

    if (storedHash === currentHash) {
      log('  seed skipped: data unchanged');
      return null;
    }

    const include = getIncludeOverrides?.() ?? {};
    const result = seedData({ compiledDir, include, verbose: options?.verbose });
    repo.settingsCommands.updateSettings('internal', null, ['seedHash'], currentHash);
    return result;
  };
}
