import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {demoCaptureMetadataPath, demoCapturePath, demoOutputPath, demoVariantOutputPath, videoPackageDir} from './paths';
import {getDemoDefinition} from '../src/demo/product-intro';

async function imageDataUrl(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function readMetadata(demoId: string, sceneId: string) {
  const file = await fs.readFile(demoCaptureMetadataPath(demoId, sceneId), 'utf-8');
  return JSON.parse(file);
}

export async function renderDemo(demoId: string) {
  const demo = getDemoDefinition(demoId);
  const entryPoint = path.join(videoPackageDir, 'src/index.ts');
  const outputLocation = demoOutputPath(demoId);

  const scenes = await Promise.all(demo.scenes.map(async (scene) => ({
    ...scene,
    src: await imageDataUrl(demoCapturePath(demoId, scene.id)),
    captureMetadata: await readMetadata(demoId, scene.id),
  })));
  const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
  const moments = 'moments' in demo
    ? demo.moments.map(moment => ({
      ...moment,
      captures: moment.captures.map(capture => {
        const scene = sceneById.get(capture.electronScene);
        if (!scene) {
          throw new Error(`Missing capture "${capture.electronScene}" for moment "${moment.id}".`);
        }
        return {
          ...capture,
          src: scene.src,
          captureMetadata: scene.captureMetadata,
        };
      }),
    }))
    : undefined;

  await fs.mkdir(path.dirname(outputLocation), {recursive: true});

  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  const inputProps = moments ? {moments, scenes} : {scenes};
  const composition = await selectComposition({
    serveUrl,
    id: demo.compositionId,
    inputProps,
  });

  if (demoId === 'cinematic-product-demo') {
    const landscapeOutput = demoVariantOutputPath(demoId, 'landscape');
    const squareOutput = demoVariantOutputPath(demoId, 'square');

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: landscapeOutput,
      inputProps,
    });

    await renderMedia({
      composition: {
        ...composition,
        width: 1080,
        height: 1080,
      },
      serveUrl,
      codec: 'h264',
      outputLocation: squareOutput,
      inputProps,
    });

    await fs.copyFile(landscapeOutput, outputLocation);
    console.log(`Rendered ${demoId} to ${landscapeOutput} and ${squareOutput}`);
    return landscapeOutput;
  }

  await renderMedia({composition, serveUrl, codec: 'h264', outputLocation, inputProps});

  console.log(`Rendered ${demoId} to ${outputLocation}`);
  return outputLocation;
}

const invokedDirectly = process.argv[1]?.endsWith('render-demo.ts');
if (invokedDirectly) {
  const demoId = process.argv[2] ?? 'product-intro';
  await renderDemo(demoId);
}
