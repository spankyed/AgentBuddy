import {spawn} from 'node:child_process';
import {repoRoot} from './paths';

const buildWorkspaces = ['@app/preload', '@app/main', '@app/renderer'];

function runNpm(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {...process.env, NODE_ENV: ''},
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

export async function buildElectronApp() {
  for (const workspace of buildWorkspaces) {
    await runNpm(['run', 'build', '--workspace', workspace]);
  }
}
