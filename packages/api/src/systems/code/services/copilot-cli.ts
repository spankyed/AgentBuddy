import { execFile } from 'child_process'
import { promisify } from 'util'
import { settingsQueries } from '@/systems/settings/repository'

const execFileAsync = promisify(execFile)

function resolvePath(): string {
  const settings = settingsQueries.getSettings()
  return settings.general.secrets.cliPaths?.['copilot'] || 'copilot'
}

export async function prompt(text: string, options?: { cwd?: string; timeout?: number }): Promise<string> {
  const cliPath = resolvePath()
  const timeout = options?.timeout ?? 30_000

  try {
    const { stdout } = await execFileAsync(cliPath, ['-p', text], {
      cwd: options?.cwd,
      timeout,
      env: { ...process.env },
    })
    return stdout.trim()
  } catch (error: any) {
    if (error.message?.includes('ENOENT')) {
      throw new Error('GitHub Copilot CLI not found. Install it (npm i -g @github/copilot-cli) or configure the path in Settings > Providers.')
    }
    if (error.killed || error.message?.includes('TIMEOUT') || error.message?.includes('timed out')) {
      throw new Error(`Copilot request timed out after ${timeout / 1000} seconds.`)
    }
    throw error
  }
}
