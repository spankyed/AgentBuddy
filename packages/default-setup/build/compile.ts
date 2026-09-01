import * as path from 'path';
import { compilePack } from '@abuddy/sdk/build';

const baseDir = path.resolve(import.meta.dirname, '..');

await compilePack({
  packDir: baseDir,
  pluginsDir: path.join(baseDir, 'src/plugins'),
  outputDir: path.join(baseDir, 'dist'),
  baseSettingsFile: path.join(baseDir, 'src/seeds/default-settings.ts'),
});
