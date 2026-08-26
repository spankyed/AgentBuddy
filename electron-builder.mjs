import pkg from './package.json' with {type: 'json'};

/**
 * Electron Builder Configuration
 * Native module rebuilding is handled by build.sh script
 */

// Exclude prebuilds for platforms we're not targeting
const excludePrebuilds = {
  win32:  ['!**/node-pty/prebuilds/darwin-*'],
  darwin: ['!**/node-pty/prebuilds/win32-*', '!**/node-pty/prebuilds/darwin-x64'],
  linux:  ['!**/node-pty/prebuilds/darwin-*', '!**/node-pty/prebuilds/win32-*'],
}[process.platform] ?? [];

// Only include speech helpers for the target platform
const speechResources = process.platform === 'win32'
  ? [{ from: 'native/speech/windows/SpeechHelper.ps1', to: 'native/speech/SpeechHelper.ps1', filter: ['**/*'] }]
  : [{ from: 'native/speech/macos/SpeechHelper', to: 'native/speech/SpeechHelper', filter: ['**/*'] }];

export default /** @type import('electron-builder').Configuration */
({
  // Basic configuration
  appId: 'com.agentbuddy.app',
  productName: 'AgentBuddy',
  directories: {
    output: 'dist',
    buildResources: 'build/resources',
  },
  icon: 'build/resources/icon',
  
  // Build options
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  generateUpdatesFilesForAllChannels: false,
  
  // Platform targets
  mac: {
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/resources/entitlements.mac.plist',
    entitlementsInherit: 'build/resources/entitlements.mac.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'AgentBuddy needs microphone access for voice input.',
      NSSpeechRecognitionUsageDescription: 'AgentBuddy uses speech recognition to convert voice to text.',
      NSDesktopFolderUsageDescription: 'AgentBuddy may need access to your Desktop when selecting files.',
      NSNetworkVolumesUsageDescription: 'AgentBuddy may need to access network volumes to locate development tools.',
      CFBundleURLTypes: [{
        CFBundleURLName: 'AgentBuddy Protocol',
        CFBundleURLSchemes: ['abuddy'],
      }],
    },
    notarize: !!process.env.APPLE_TEAM_ID,
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
  npmRebuild: false, // Selective rebuild in build.sh (lmdb uses NAPI prebuilds, only node-pty needs rebuild)
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
    '!**/*.d.ts.map',
    '!**/*.ts',
    '!**/*.tsx',
    '!**/.env',
    '!**/.env.*',
    '!**/tsconfig.json',
    '!**/tsconfig.*.json',
    '!**/vite.config.*',
    '!**/tailwind.config.*',
    '!**/postcss.config.*',
    '!**/rollup*.config.*',
    '!**/scripts/**',
    '!**/.turbo/**',
    '!**/.claude/**',
    '!**/local_cache/**',
    '!packages/*/src/**',
    '!packages/renderer/public/**',
    // Include compiled output
    'packages/*/dist/**',
    // Include API's local node_modules
    'packages/api/node_modules/**/*',
    // Exclude platform-specific prebuilds not needed for current target
    ...excludePrebuilds,
    // Exclude dev tool artifacts
    '!**/node_modules/.bin',
    '!**/node_modules/@types/**',
    '!**/node_modules/**/docs/**',
    '!**/node_modules/**/CHANGELOG*',
    '!**/node_modules/**/.eslintrc*',
  ],

  // Disable ASAR — API server runs as a separate child process (spawn + ELECTRON_RUN_AS_NODE)
  // which cannot access files inside an ASAR archive. The entire API package (dist + node_modules)
  // must live on the real filesystem.
  asar: false,
  
  // Extra resources
  extraResources: [
    // TODO: [SEARCH_INDEX_FF] Re-enable when search index is restored
    // {
    //   from: 'packages/api/local_cache',
    //   to: 'api/local_cache',
    //   filter: ['**/*']
    // }
    ...speechResources,
  ],
  
  // Publishing: enable with PUBLISH_TO_GITHUB=true
  publish: process.env.PUBLISH_TO_GITHUB === 'true' ? {
    provider: 'github',
    owner: 'spankyed',
    repo: 'AgentBuddy',
    releaseType: 'draft'
  } : null
});