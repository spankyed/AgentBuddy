import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {demoCapturePath, repoRoot} from './paths';
import {getDemoDefinition} from '../src/demo/product-intro';
import {buildElectronApp} from './build-electron-app';

const require = createRequire(import.meta.url);

function electronRuntimeEnv() {
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  env.NODE_ENV = env.NODE_ENV === 'production' ? '' : (env.NODE_ENV ?? '');
  return env;
}

export async function captureDemoScene(demoId: string, sceneId: string, options: {skipBuild?: boolean} = {}) {
  const demo = getDemoDefinition(demoId);
  const scene = demo.scenes.find(item => item.id === sceneId);
  if (!scene) {
    throw new Error(`Unknown scene "${sceneId}" for demo "${demoId}".`);
  }

  const outputPath = demoCapturePath(demoId, scene.id);
  await fs.mkdir(path.dirname(outputPath), {recursive: true});

  if (!options.skipBuild) {
    await buildElectronApp();
  }

  const electronPath = String(require('electron'));
  const args = [
    '.',
    '--demo',
    demoId,
    '--demo-scene',
    scene.id,
    '--capture-output',
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(electronPath, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: electronRuntimeEnv(),
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron capture exited with code ${code ?? 'unknown'}.`));
    });
  });

  console.log(`Captured ${demoId}/${scene.id} to ${outputPath}`);
  return outputPath;
}

const invokedDirectly = process.argv[1]?.endsWith('capture-demo-scene.ts');
if (invokedDirectly) {
  const demoId = process.argv[2] ?? 'product-intro';
  const sceneId = process.argv[3] ?? 'workspace';
  await captureDemoScene(demoId, sceneId);
}
