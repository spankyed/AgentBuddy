import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderTemplate } from '../../templates.ts';
import { validateName, toPascalCase, writeIfNotExists, logCreated, parseFlag, hasFlag, updateRegisterArray, updateComponentMap } from './write';
import { readManifest } from './manifest';

const HELP = `
Usage: abuddy add artifact <type> [options]

Options:
  --icon <Icon>    Lucide icon name (default: FileText)

Example:
  abuddy add artifact chart --icon BarChart3
`.trim();

// The threads artifact panel renders a viewer with the selected `artifact` (ArtifactItem)

export async function addArtifact(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Artifact');

  const icon = parseFlag(args, '--icon') || 'FileText';
  const pascal = toPascalCase(type);
  const viewerPath = path.join(root, 'src', 'extensions', 'artifacts', 'viewers', `${type}-artifact.vue`);

  const created: string[] = [];
  if (writeIfNotExists(viewerPath, renderTemplate('pack/src/extensions/artifacts/viewers/artifact.vue', { ICON: icon }))) {
    created.push(viewerPath);
  }

  const manifest = readManifest(root);
  const registerPath = manifest.artifacts;

  if (registerPath) {
    // The host renders fe.component, which register-fe.ts sets from its componentMap
    const registerFile = path.join(root, registerPath);
    const importsIcon = fs.existsSync(registerFile)
      && new RegExp(`import\\s*\\{[^}]*\\b${icon}\\b[^}]*\\}\\s*from\\s*['"]lucide-vue-next['"]`).test(fs.readFileSync(registerFile, 'utf-8'));
    updateRegisterArray(
      registerFile,
      importsIcon ? '' : `import { ${icon} } from 'lucide-vue-next';`,
      `  { type: '${type}', fe: { icon: ${icon} } },\n`,
    );

    const feRegisterPath = registerPath.replace(/\.ts$/, '-fe.ts');
    const importName = `${pascal}Artifact`;
    updateComponentMap(
      path.join(root, feRegisterPath),
      `import ${importName} from './viewers/${type}-artifact.vue';`,
      type,
      importName,
    );
  }

  console.log(`\nCreated artifact viewer "${type}":`);
  logCreated(root, created);
  if (registerPath) console.log(`\n  register files updated`);
}
