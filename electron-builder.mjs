import pkg from './package.json' with {type: 'json'};

/**
 * Electron Builder Configuration
 * Native module rebuilding is handled by build.sh script
 */

export default /** @type import('electron-builder').Configuration */
({
  // Basic configuration
  appId: 'com.agentbuddy.app',
  productName: 'AgentBuddy',
  directories: {
    output: 'dist',
    buildResources: 'buildResources',
  },
  
  // Build options
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  generateUpdatesFilesForAllChannels: true,
  
  // Platform targets
  mac: {
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'buildResources/entitlements.mac.plist',
    entitlementsInherit: 'buildResources/entitlements.mac.plist',
    target: [
      {
        target: 'dmg',
        arch: ['arm64', 'x64']
      },
      {
        target: 'zip',
        arch: ['arm64', 'x64']
      }
    ]
  },
  
  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications'
      }
    ]
  },
  
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ]
  },
  
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      }
    ],
    category: 'Development'
  },
  
  // Native modules configuration
  npmRebuild: false, // We handle rebuilding in build.sh
  nodeGypRebuild: false, // We use @electron/rebuild in build.sh
  
  // Files configuration
  files: [
    'LICENSE*',
    pkg.main,
    'packages/**/*',
    'node_modules/**/*',
    '!**/test/**',
    '!**/*.md',
    '!**/LICENSE*',
    '!**/.git',
    '!**/*.map',
    '!**/*.ts',
    '!**/*.tsx',
    '!**/tsconfig.json',
    '!**/vite.config.*',
    '!**/tailwind.config.*',
    '!**/postcss.config.*',
    '!packages/*/src/**',
    '!packages/renderer/public/**',
    // Include compiled output
    'packages/*/dist/**',
    // Include API's local node_modules
    'packages/api/node_modules/**/*'
  ],
  
  // Disable asar for API server file access
  asar: false,
  
  // Extra resources
  extraResources: [
    {
      from: 'packages/api/local_cache',
      to: 'api/local_cache',
      filter: ['**/*']
    }
  ],
  
  // Publishing configuration (optional)
  publish: {
    provider: 'github',
    owner: 'spankyed',
    repo: 'AgentBuddy',
    releaseType: 'draft'
  }
});