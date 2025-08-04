import { execSync } from 'child_process'

/**
 * Get the root directory of the git repository
 * Returns null if not in a git repository
 */
export function getGitRepositoryRoot(): string | null {
  try {
    // Use git to find the repository root
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr to suppress git errors
    }).trim()
    
    return gitRoot
  } catch (error) {
    // Not in a git repository or git not available
    return null
  }
}