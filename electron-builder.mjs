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
  icon: 'buildResources/icon',
  
  // Build options
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  generateUpdatesFilesForAllChannels: false,
  
  // Platform targets
  mac: {
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'buildResources/entitlements.mac.plist',
    entitlementsInherit: 'buildResources/entitlements.mac.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'AgentBuddy needs microphone access for voice input.',
      NSSpeechRecognitionUsageDescription: 'AgentBuddy uses speech recognition to convert voice to text.',
    },
    target: [
      {
        target: 'dmg',
        arch: ['arm64'] // Only build for Apple Silicon
      },
      {
        target: 'zip',
        arch: ['arm64'] // Only build for Apple Silicon
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
  npmRebuild: true, // Let electron-builder handle native module rebuilding
  nodeGypRebuild: false, // Use npmRebuild instead
  
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
  
  // Disable ASAR - API needs full filesystem access to dependencies
  asar: false,
  
  // Extra resources
  extraResources: [
    // TODO: [SEARCH_INDEX_FF] Re-enable when search index is restored
    // {
    //   from: 'packages/api/local_cache',
    //   to: 'api/local_cache',
    //   filter: ['**/*']
    // }
    {
      from: 'native/speech/macos/SpeechHelper',
      to: 'native/speech/SpeechHelper',
      filter: ['**/*'],
    },
    {
      from: 'native/speech/windows/SpeechHelper.ps1',
      to: 'native/speech/SpeechHelper.ps1',
      filter: ['**/*'],
    },
  ],
  
  // Disable publishing and auto-updater
  publish: null
});