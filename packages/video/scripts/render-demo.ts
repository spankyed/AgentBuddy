import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {demoCapturePath, demoOutputPath, videoPackageDir} from './paths';
import {getDemoDefinition} from '../src/demo/product-intro';

async function imageDataUrl(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export async function renderDemo(demoId: string) {
  const demo = getDemoDefinition(demoId);
  const entryPoint = path.join(videoPackageDir, 'src/index.ts');
  const outputLocation = demoOutputPath(demoId);

  const scenes = await Promise.all(demo.scenes.map(async (scene) => ({
    ...scene,
    src: await imageDataUrl(demoCapturePath(demoId, scene.id)),
  })));

  await fs.mkdir(path.dirname(outputLocation), {recursive: true});

  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  const inputProps = {scenes};
  const composition = await selectComposition({
    serveUrl,
    id: demo.compositionId,
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps,
  });

  console.log(`Rendered ${demoId} to ${outputLocation}`);
  return outputLocation;
}

const invokedDirectly = process.argv[1]?.endsWith('render-demo.ts');
if (invokedDirectly) {
  const demoId = process.argv[2] ?? 'product-intro';
  await renderDemo(demoId);
}
