/**
 * `claude auth` — login, logout, status.
 *
 * `login` is interactive by nature (opens a browser for Claude.ai, prompts
 * for SSO, etc.); we expose it anyway for completeness but callers should
 * usually delegate to the CLI UI rather than call this programmatically.
 */

import { run, runJson, type SubcommandOptions } from './subcommand'

export interface AuthLoginOptions extends SubcommandOptions {
  email?: string
  /** Use SSO flow. */
  sso?: boolean
  /** Use Anthropic Console (API key billing) instead of Claude.ai. */
  console?: boolean
  /** Use Claude.ai subscription (default when neither flag is set). */
  claudeai?: boolean
}

/** Start an interactive login flow. Waits for CLI exit. */
export async function login(opts: AuthLoginOptions = {}): Promise<string> {
  const args = ['auth', 'login']
  if (opts.email) args.push('--email', opts.email)
  if (opts.sso) args.push('--sso')
  if (opts.console) args.push('--console')
  if (opts.claudeai) args.push('--claudeai')
  return run(args, opts)
}

/** Sign out of Anthropic. */
export async function logout(opts?: SubcommandOptions): Promise<string> {
  return run(['auth', 'logout'], opts)
}

/** Shape of `claude auth status --json` — passthrough, CLI may add fields. */
export interface AuthStatus {
  authenticated?: boolean
  /** Claude Max / claude.ai subscriptions return `loggedIn` instead of `authenticated`. */
  loggedIn?: boolean
  source?: 'user' | 'project' | 'org' | 'temporary' | 'oauth'
  authMethod?: string
  apiProvider?: string
  account?: Record<string, unknown>
  [key: string]: unknown
}

export async function status(opts?: SubcommandOptions): Promise<AuthStatus> {
  return runJson<AuthStatus>(['auth', 'status', '--json'], opts)
}
