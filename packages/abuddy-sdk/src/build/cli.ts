#!/usr/bin/env tsx
import * as path from 'path';
import { compilePack } from './seed-compiler';

const packDir = path.resolve(process.argv[2] ?? '.');
const outputDir = path.resolve(packDir, process.argv[3] ?? 'dist');

await compilePack({ packDir, outputDir });
