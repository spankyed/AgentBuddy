#!/usr/bin/env node
// Fails when a packaged app ships a module without one of its declared dependencies.
// electron-builder's dependency collector once dropped 112 of them (e.g. nanoid under
// @ai-sdk/provider-utils) and the packaged API couldn't start; nothing failed at build time.
//
//   node build/prod/verify-node-modules.mjs "dist/mac-arm64/AgentBuddy.app/Contents/Resources/app"
import fs from 'node:fs';
import path from 'node:path';

const appDir = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(appDir, 'package.json'))) {
  console.error(`Not a packaged app dir: ${appDir}`);
  process.exit(2);
}

/** Every package.json under a node_modules tree, including nested node_modules. */
function* packages(nodeModules) {
  if (!fs.existsSync(nodeModules)) return;
  for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const dirs = entry.name.startsWith('@')
      ? fs.readdirSync(path.join(nodeModules, entry.name)).map(n => path.join(nodeModules, entry.name, n))
      : [path.join(nodeModules, entry.name)];
    for (const dir of dirs) {
      if (fs.existsSync(path.join(dir, 'package.json'))) yield dir;
      yield* packages(path.join(dir, 'node_modules'));
    }
  }
}

/** Node's lookup: node_modules/<name> in the package dir, then each parent up to the app. */
function resolvable(fromDir, name) {
  for (let dir = fromDir; dir.startsWith(appDir); dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules', name, 'package.json'))) return true;
    if (dir === appDir) break;
  }
  return false;
}

const missing = [];
const roots = [
  path.join(appDir, 'node_modules'),
  ...fs.readdirSync(path.join(appDir, 'packages')).map(p => path.join(appDir, 'packages', p, 'node_modules')),
];
for (const root of roots) {
  for (const dir of packages(root)) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      // Type-only; electron-builder.mjs excludes node_modules/@types on purpose
      if (name.startsWith('@types/')) continue;
      if (!resolvable(dir, name)) missing.push(`${path.relative(appDir, dir)} → ${name}`);
    }
  }
}

if (missing.length > 0) {
  console.error(`Packaged app is missing ${missing.length} declared dependencies:\n${missing.map(m => `  ${m}`).join('\n')}`);
  process.exit(1);
}
console.log('Packaged node_modules: every declared dependency is present');
