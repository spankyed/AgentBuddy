import { execSync } from 'child_process'

/**
 * Get the root directory of the git repository
 * Falls back to process.cwd() if not in a git repository
 */
export function getGitRepositoryRoot(): string {
  try {
    // Use git to find the repository root
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr to suppress git errors
    }).trim()
    
    return gitRoot
  } catch (error) {
    // Not in a git repository or git not available
    console.warn('Unable to determine git repository root, falling back to process.cwd()')
    return process.cwd()
  }
}