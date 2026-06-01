import {captureDemoScene} from './capture-demo-scene';
import {renderDemo} from './render-demo';
import {getDemoDefinition} from '../src/demo/product-intro';
import {buildElectronApp} from './build-electron-app';

const demoId = process.argv[2] ?? 'product-intro';
const demo = getDemoDefinition(demoId);

await buildElectronApp();

for (const scene of demo.scenes) {
  await captureDemoScene(demoId, scene.id, {skipBuild: true});
}

await renderDemo(demoId);
