#!/usr/bin/env node
// Generates a dev icon with a blue-tinted bandana from the production logo.
// Usage: node build/resources/gen-dev-icon.mjs
// Requires: npm install sharp (or run from a directory with sharp installed)

import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '..', '..', 'resources', 'logo-dark.png');
const OUT_FULL = join(__dirname, '..', '..', 'resources', 'logo-dark-dev.png');
const OUT_ICON = join(__dirname, 'icon-dev.png');

// Bounding box around the bandana region including knot/tail (1024x1024 image)
const BOX = { x1: 60, y1: 80, x2: 780, y2: 440 };

// Target blue color for tinting
const BLUE = { r: 70, g: 130, b: 220 };

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return { s, l };
}

async function main() {
  const image = sharp(SOURCE);
  const { width, height } = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = Buffer.from(data);

  for (let y = BOX.y1; y < BOX.y2 && y < height; y++) {
    for (let x = BOX.x1; x < BOX.x2 && x < width; x++) {
      const i = (y * width + x) * channels;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const { s, l } = rgbToHsl(r, g, b);

      // Target white and gray bandana pixels: catch shadows too
      if (l > 0.55 && s < 0.25) {
        const blend = Math.min(1, (l - 0.45) / 0.45) * Math.max(0.3, 1 - s / 0.25);
        pixels[i]     = Math.round(r + (BLUE.r - r) * blend);
        pixels[i + 1] = Math.round(g + (BLUE.g - g) * blend);
        pixels[i + 2] = Math.round(b + (BLUE.b - b) * blend);
      }
    }
  }

  await sharp(pixels, { raw: { width, height, channels } }).png().toFile(OUT_FULL);
  console.log(`  ${OUT_FULL}`);

  await sharp(pixels, { raw: { width, height, channels } }).resize(512, 512).png().toFile(OUT_ICON);
  console.log(`  ${OUT_ICON}`);

  console.log('Done — dev icons generated.');
}

main().catch(err => { console.error(err); process.exit(1); });
