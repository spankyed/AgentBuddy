import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {fps, totalFrames, type FilmVariant} from '../src/film/timeline';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variant: FilmVariant = process.argv[2] === 'square' ? 'square' : 'landscape';
const width = variant === 'square' ? 1080 : 1440;
const height = variant === 'square' ? 1080 : 900;
const outDir = path.join(packageDir, 'out', `vue-film-${variant}`);
const framesDir = path.join(outDir, 'frames');
const outputPath = path.join(packageDir, 'out', `agentbuddy-vue-film-${variant}.mp4`);
const renderFrames = Math.min(totalFrames, Number(process.env.VIDEO_MAX_FRAMES ?? totalFrames));

async function emptyDir(dir: string) {
  await fs.rm(dir, {recursive: true, force: true});
  await fs.mkdir(dir, {recursive: true});
}

async function runFfmpeg() {
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame-%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ];
    const child = spawn('ffmpeg', args, {stdio: 'inherit'});
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code ?? 'unknown'}`));
    });
  });
}

await emptyDir(framesDir);

const server = await createServer({
  configFile: path.join(packageDir, 'vite.config.ts'),
  server: {host: '127.0.0.1', port: 5178},
});

await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Unable to resolve Vite server URL.');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
  for (let frame = 0; frame < renderFrames; frame += 1) {
    await page.goto(`${url}?variant=${variant}&frame=${frame}`, {waitUntil: 'networkidle'});
    await page.screenshot({path: path.join(framesDir, `frame-${String(frame + 1).padStart(5, '0')}.png`)});
    if (frame % 120 === 0) {
      console.log(`Captured ${frame}/${renderFrames} ${variant} frames`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

await runFfmpeg();
console.log(`Rendered ${variant} Vue film to ${outputPath}`);
