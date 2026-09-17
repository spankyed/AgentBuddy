// Whether a tool built for one AgentBuddy version may open data another version wrote
import semver from 'semver';

/** The data was written by an AgentBuddy version the tool doesn't support */
export class DataVersionMismatchError extends Error {
  constructor(readonly dataVersion: string, readonly supportedVersion: string) {
    super(`The data was last migrated by AgentBuddy ${dataVersion}, but this tool supports AgentBuddy ${supportedVersion} (the same major and minor version)`);
    this.name = 'DataVersionMismatchError';
  }
}

/** A version's major.minor, a prerelease counting as its release */
function releaseLine(version: string): string | undefined {
  const parsed = semver.parse(version);
  return parsed ? `${parsed.major}.${parsed.minor}` : undefined;
}

/**
 * Throws `DataVersionMismatchError` unless data at `dataVersion` has the major and minor version of
 * `supportedVersion`, the AgentBuddy version the tool was built for. Data that records no version is new data,
 * which any version opens.
 */
export function checkDataVersion(dataVersion: string | undefined, supportedVersion: string): void {
  if (dataVersion === undefined) return;
  const line = releaseLine(dataVersion);
  if (!line || line !== releaseLine(supportedVersion)) throw new DataVersionMismatchError(dataVersion, supportedVersion);
}
