#!/usr/bin/env node

/**
 * Interactive release CLI for AgentBuddy
 *
 * Usage:
 *   npm run release                   # interactive prompt
 *   npm run release -- patch          # skip bump prompt
 *   npm run release -- minor --dry-run
 */

import { createInterface } from 'node:readline/promises';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { stdin, stdout } from 'node:process';

// --- CLI args ---

const { values, positionals } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: false,
});

if (values.help) {
  console.log(`
Usage: release.mjs [patch|minor|major] [--dry-run]

  patch        Bump patch version (default if interactive)
  minor        Bump minor version
  major        Bump major version
  --dry-run    Preview what would happen without making changes
  -h, --help   Show this help
`);
  process.exit(0);
}

const DRY_RUN = values['dry-run'];
const bumpArg = positionals.find(p => ['patch', 'minor', 'major'].includes(p));

// --- Helpers ---

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: opts.inherit ? 'inherit' : 'pipe', ...opts }).trim();
}

function step(n, msg) {
  process.stdout.write(`${BLUE}[${n}/6]${NC} ${msg}`);
}

function ok(msg = '') {
  console.log(` ${GREEN}✓${NC}${msg ? ' ' + msg : ''}`);
}

function fail(msg) {
  console.log(` ${RED}✗ ${msg}${NC}`);
  process.exit(1);
}

function getVersion() {
  return JSON.parse(readFileSync('package.json', 'utf-8')).version;
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    default: return `${major}.${minor}.${patch + 1}`;
  }
}

// --- Main ---

const rl = createInterface({ input: stdin, output: stdout });

async function ask(question, defaultVal = '') {
  const suffix = defaultVal ? ` ${DIM}(${defaultVal})${NC} ` : ' ';
  const answer = await rl.question(question + suffix);
  return answer.trim() || defaultVal;
}

async function confirm(question) {
  const answer = await ask(question, 'Y');
  return answer.toLowerCase() !== 'n';
}

async function main() {
  console.log('');
  console.log('==========================================');
  console.log('🚀 AgentBuddy Release');
  if (DRY_RUN) console.log(`${YELLOW}   (dry run)${NC}`);
  console.log('==========================================');
  console.log('');

  // Step 1: Clean working tree
  step(1, 'Checking working tree...');
  const status = run('git status --porcelain');
  if (status) {
    fail('Working tree is dirty. Commit or stash changes first.');
  }
  ok();
  console.log('');

  // Prompt for bump type
  const currentVersion = getVersion();
  let bumpType = bumpArg;

  if (!bumpType) {
    const patch = bumpVersion(currentVersion, 'patch');
    const minor = bumpVersion(currentVersion, 'minor');
    const major = bumpVersion(currentVersion, 'major');

    console.log('? Bump type:');
    console.log(`  1) patch  ${currentVersion} → ${patch}`);
    console.log(`  2) minor  ${currentVersion} → ${minor}`);
    console.log(`  3) major  ${currentVersion} → ${major}`);

    const choice = await ask('>',  '1');
    bumpType = { '1': 'patch', '2': 'minor', '3': 'major', 'patch': 'patch', 'minor': 'minor', 'major': 'major' }[choice];
    if (!bumpType) {
      console.log(`${RED}Invalid choice: ${choice}${NC}`);
      process.exit(1);
    }
    console.log('');
  }

  const newVersion = bumpVersion(currentVersion, bumpType);

  // Step 2: Typecheck
  step(2, 'Running type checks...');
  try {
    run('npm run typecheck', { inherit: true });
    ok();
  } catch {
    fail('Type checks failed');
  }
  console.log('');

  // Step 3: Tests
  step(3, 'Running tests...');
  try {
    run('npm test', { inherit: true });
    ok();
  } catch {
    fail('Tests failed');
  }
  console.log('');

  // Step 4: Bump version
  step(4, `Bumping version (${bumpType})...`);
  if (!DRY_RUN) {
    run(`npm version ${newVersion} --no-git-tag-version --allow-same-version`);
  }
  ok(`${currentVersion} → ${newVersion}`);
  console.log('');

  // Step 5: Generate changelog
  step(5, 'Generating changelog...\n');

  const lastTag = (() => {
    try { return run('git describe --tags --abbrev=0'); } catch { return ''; }
  })();
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const date = new Date().toISOString().split('T')[0];

  let entry = `## v${newVersion} (${date})\n`;

  const groups = [
    { label: 'Features', grep: '^feat' },
    { label: 'Fixes', grep: '^fix' },
    { label: 'Refactors', grep: '^refactor' },
  ];

  for (const { label, grep } of groups) {
    try {
      const lines = run(`git log ${range} --oneline --grep="${grep}" --format="- %s"`);
      if (lines) entry += `\n### ${label}\n${lines}\n`;
    } catch { /* no matches */ }
  }

  // Other commits (not matching known prefixes, not release commits)
  try {
    const all = run(`git log ${range} --oneline --format="%s"`);
    const other = all.split('\n')
      .filter(l => l && !l.startsWith('feat') && !l.startsWith('fix') && !l.startsWith('refactor') && !l.startsWith('chore(release)'))
      .map(l => `- ${l}`)
      .join('\n');
    if (other) entry += `\n### Other\n${other}\n`;
  } catch { /* empty */ }

  console.log(`${DIM}${entry}${NC}`);

  // Confirm before proceeding
  const proceed = await confirm(`\n? Proceed with release v${newVersion}?`);
  if (!proceed) {
    if (!DRY_RUN) {
      run(`npm version ${currentVersion} --no-git-tag-version --allow-same-version`);
    }
    console.log(`\n${YELLOW}Aborted.${NC}`);
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('');
    console.log(`${YELLOW}[DRY RUN] Would create:${NC}`);
    console.log(`  Commit: chore(release): v${newVersion}`);
    console.log(`  Tag: v${newVersion}`);
    console.log(`  Push to origin (triggers CI build)`);
    console.log('');
    // Revert bump
    run(`npm version ${currentVersion} --no-git-tag-version --allow-same-version`);
    process.exit(0);
  }

  // Step 6: Write changelog, commit, tag, push
  console.log('');
  step(6, 'Committing, tagging, pushing...');

  // Write changelog
  if (existsSync('CHANGELOG.md')) {
    const existing = readFileSync('CHANGELOG.md', 'utf-8');
    const withoutHeader = existing.replace(/^# Changelog\n*/, '');
    writeFileSync('CHANGELOG.md', `# Changelog\n\n${entry}\n${withoutHeader}`);
  } else {
    writeFileSync('CHANGELOG.md', `# Changelog\n\n${entry}`);
  }

  run('git add package.json package-lock.json CHANGELOG.md');
  run(`git commit -m "chore(release): v${newVersion}"`);
  run(`git tag v${newVersion}`);
  run('git push origin HEAD');
  run(`git push origin v${newVersion}`);

  ok();
  console.log('');

  console.log('==========================================');
  console.log(`✅ Release v${newVersion} pushed!`);
  console.log('==========================================');
  console.log('');
  console.log('📦 CI will build, sign, and publish the release automatically.');
  console.log('📋 View at: https://github.com/spankyed/AgentBuddy/releases');
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error(`${RED}${err.message}${NC}`);
  process.exit(1);
});
