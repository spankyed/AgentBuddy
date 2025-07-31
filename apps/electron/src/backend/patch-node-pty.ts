// Patch node-pty to work with Electron
import * as path from 'path';
import * as fs from 'fs';

export function patchNodePty() {
  try {
    // Find the node-pty module
    const nodePtyPath = require.resolve('node-pty-prebuilt-multiarch');
    const nodePtyDir = path.dirname(nodePtyPath);
    
    // Create symlinks from build to prebuilds
    const buildDir = path.join(nodePtyDir, 'build');
    const releaseDir = path.join(buildDir, 'Release');
    const debugDir = path.join(buildDir, 'Debug');
    
    // Create directories if they don't exist
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
    if (!fs.existsSync(releaseDir)) {
      fs.mkdirSync(releaseDir, { recursive: true });
    }
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    // Determine the correct prebuild based on platform and architecture
    const platform = process.platform;
    const arch = process.arch;
    const prebuildDir = path.join(nodePtyDir, 'prebuilds', `${platform}-${arch}`);
    
    // Find the appropriate .node file
    if (fs.existsSync(prebuildDir)) {
      const files = fs.readdirSync(prebuildDir);
      const nodeFile = files.find(f => f.endsWith('.node'));
      
      if (nodeFile) {
        const sourcePath = path.join(prebuildDir, nodeFile);
        const releasePath = path.join(releaseDir, 'pty.node');
        const debugPath = path.join(debugDir, 'pty.node');
        
        // Copy the file instead of symlinking for compatibility
        if (!fs.existsSync(releasePath)) {
          fs.copyFileSync(sourcePath, releasePath);
        }
        if (!fs.existsSync(debugPath)) {
          fs.copyFileSync(sourcePath, debugPath);
        }
        
        console.log('✅ Patched node-pty for Electron');
      }
    }
  } catch (error) {
    console.warn('Failed to patch node-pty:', error);
  }
}