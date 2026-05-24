import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const fidelityPath = path.join(packageDir, 'src/agentbuddy-ui/FIDELITY.md');
  const rootPath = path.join(packageDir, 'src/Root.tsx');
  const srcDir = path.join(packageDir, 'src');
  const uiDir = path.join(packageDir, 'src/agentbuddy-ui');
  const filmStateDir = path.join(packageDir, 'src/film/state');

  const [fidelity, root] = await Promise.all([
    fs.readFile(fidelityPath, 'utf8'),
    fs.readFile(rootPath, 'utf8'),
  ]);

  const registered = new Set([...root.matchAll(/<Composition\s+id="([^"]+)"/g)].map(match => match[1]));
  const referenced = new Set();
  const documentedLocalPaths = new Set();
  const documentedRendererPaths = new Set();

  for (const line of fidelity.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').map(cell => cell.trim());
    const replicaCell = cells[2] ?? '';
    const rendererCell = cells[3] ?? '';
    const demoCell = cells[4] ?? '';
    for (const match of replicaCell.matchAll(/`([^`]+)`/g)) {
      const localPath = match[1];
      if (localPath.includes('/')) documentedLocalPaths.add(localPath);
    }
    for (const match of rendererCell.matchAll(/`([^`]+)`/g)) {
      const rendererPath = match[1];
      if (rendererPath.startsWith('packages/renderer/')) documentedRendererPaths.add(rendererPath);
    }
    for (const match of demoCell.matchAll(/`([^`]+)`/g)) {
      const name = match[1];
      if (name.endsWith('Demo') || name.endsWith('Film')) referenced.add(name);
    }
  }

  const missing = [...referenced].filter(name => !registered.has(name));
  if (missing.length > 0) {
    throw new Error(`FIDELITY.md references unregistered compositions: ${missing.join(', ')}`);
  }

  const missingLocalPaths = [];
  for (const localPath of documentedLocalPaths) {
    const fullPath = localPath.startsWith('film/')
      ? path.join(srcDir, localPath)
      : path.join(uiDir, localPath);
    if (!(await exists(fullPath))) missingLocalPaths.push(localPath.startsWith('film/') ? localPath : `agentbuddy-ui/${localPath}`);
  }

  const missingRendererPaths = [];
  for (const rendererPath of documentedRendererPaths) {
    const fullPath = path.join(packageDir, '..', '..', rendererPath);
    if (!(await exists(fullPath))) missingRendererPaths.push(rendererPath);
  }

  const uiFiles = await listFiles(uiDir);
  const remotionLeaks = [];
  const filmLeaks = [];
  const stateRemotionLeaks = [];
  const forbiddenIndicators = [];
  const fixtureLeaks = [];
  const forbiddenIndicatorPatterns = [
    /\bisTyping\b/,
    /TypingIndicator/,
    /typingPulse/,
    /streamingDots/,
    /streamingPulse/,
    /Assistant is typing/,
  ];
  const forbiddenFixturePatterns = [
    /AgentBuddy/i,
    /Clientlabs/i,
    /spankyed/i,
    /as\/react-launch-film/i,
    /packages\/video/i,
    /launch film/i,
    /Preview build passed/i,
    /Release checks passed/i,
  ];

  await Promise.all(uiFiles.map(async file => {
    if (!/\.(ts|tsx)$/.test(file)) return;
    const source = await fs.readFile(file, 'utf8');
    const relative = path.relative(packageDir, file);
    if (/from ['"]remotion['"]|useCurrentFrame|useVideoConfig|spring\(/.test(source)) remotionLeaks.push(relative);
    if (/from ['"].*\.\.\/\.\.\/film|from ['"].*\.\.\/film|from ['"].*\/film\//.test(source)) filmLeaks.push(relative);
    if (forbiddenIndicatorPatterns.some(pattern => pattern.test(source))) forbiddenIndicators.push(relative);
    if (forbiddenFixturePatterns.some(pattern => pattern.test(source))) fixtureLeaks.push(relative);
  }));

  const stateFiles = await listFiles(filmStateDir);
  await Promise.all(stateFiles.map(async file => {
    if (!/\.(ts|tsx)$/.test(file)) return;
    const source = await fs.readFile(file, 'utf8');
    const relative = path.relative(packageDir, file);
    if (/from ['"]remotion['"]|useCurrentFrame|useVideoConfig|spring\(|interpolate\(/.test(source)) stateRemotionLeaks.push(relative);
  }));

  if (remotionLeaks.length > 0) {
    throw new Error(`agentbuddy-ui must not import Remotion APIs: ${remotionLeaks.join(', ')}`);
  }
  if (missingLocalPaths.length > 0) {
    throw new Error(`FIDELITY.md references missing local replica files: ${missingLocalPaths.join(', ')}`);
  }
  if (missingRendererPaths.length > 0) {
    throw new Error(`FIDELITY.md references missing renderer files: ${missingRendererPaths.join(', ')}`);
  }
  if (filmLeaks.length > 0) {
    throw new Error(`agentbuddy-ui must not import film-layer modules: ${filmLeaks.join(', ')}`);
  }
  if (forbiddenIndicators.length > 0) {
    throw new Error(`Rejected typing/three-dot indicators found in agentbuddy-ui: ${forbiddenIndicators.join(', ')}`);
  }
  if (fixtureLeaks.length > 0) {
    throw new Error(`Film fixture/project strings must live in film/state, not agentbuddy-ui: ${fixtureLeaks.join(', ')}`);
  }
  if (stateRemotionLeaks.length > 0) {
    throw new Error(`film/state must stay data/timeline-only and not import Remotion APIs: ${stateRemotionLeaks.join(', ')}`);
  }

  console.log(`Fidelity audit passed: ${referenced.size} referenced demos registered; no agentbuddy-ui film/Remotion leaks.`);
}

async function exists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const nested = await Promise.all(entries.map(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

await main();
