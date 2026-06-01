import path from 'node:path';
import process from 'node:process';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const compositionId = process.argv[2] ?? 'AgentBuddyIntro';
const output = process.argv[3] ?? `out/${compositionId}.mp4`;
const entryPoint = path.join(process.cwd(), 'src/index.ts');
const outputLocation = path.resolve(process.cwd(), output);

const bundleLocation = await bundle({
  entryPoint,
  webpackOverride: (config) => config,
});

const composition = await selectComposition({
  serveUrl: bundleLocation,
  id: compositionId,
});

await renderMedia({
  composition,
  serveUrl: bundleLocation,
  codec: 'h264',
  outputLocation,
});

console.log(`Rendered ${compositionId} to ${outputLocation}`);
