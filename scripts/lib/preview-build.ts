import { parseArgs } from 'node:util';

export function previewVersion(args: string[]): string {
  const { values } = parseArgs({ args, options: { version: { type: 'string' } }, strict: true });
  const target = values.version;
  if (!target || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-preview\.(0|[1-9]\d*))?$/.test(target)) {
    throw new Error('Use npm run build:preview -- --version <x.y.z> (or <x.y.z-preview.N>).');
  }
  return target.includes('-preview.') ? target : `${target}-preview.1`;
}

export function previewEnvironment(version: string, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...inherited, APACK_ENV: 'preview', APACK_BUILD_VERSION: version,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false', PUBLISH_TO_GITHUB: 'false' };
  delete env.NODE_ENV;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
