import { timingSafeEqual } from 'node:crypto';

export const SERVER_CONFIG = {
  DEFAULT_PORT: 3001,
  get port(): number {
    return process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : this.DEFAULT_PORT;
  }
};

/**
 * The token every client must present, which Electron main creates for each app run and passes as
 * `ABUDDY_API_TOKEN`. Without it the API refuses to start: an open API would take any local web page's calls.
 */
export function apiToken(): string {
  const token = process.env.ABUDDY_API_TOKEN;
  if (!token) throw new Error('ABUDDY_API_TOKEN is unset: the app passes it to the API it starts; a manual boot sets one');
  return token;
}

/** Whether `given` is the API token, compared in constant time */
export function isApiToken(given: string | null | undefined, token = apiToken()): boolean {
  if (!given) return false;
  const actual = Buffer.from(token);
  const candidate = Buffer.from(given);
  return candidate.length === actual.length && timingSafeEqual(candidate, actual);
}
