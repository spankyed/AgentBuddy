import log from 'electron-log/main';
import { app } from 'electron';

// Match previous 10MB rotation limit
log.transports.file.maxSize = 10 * 1024 * 1024;

export function logInfo(...args: any[]): void {
  log.info(...args);
}

export function logError(...args: any[]): void {
  log.error(...args);
}

export function logWarn(...args: any[]): void {
  log.warn(...args);
}

export function logStartupBanner(): void {
  log.info('='.repeat(60));
  log.info(`AgentBuddy Started: ${new Date().toISOString()}`);
  log.info(`Version: ${app.getVersion()}`);
  log.info(`Platform: ${process.platform}`);
  log.info(`Electron: ${process.versions.electron}`);
  log.info(`Node: ${process.versions.node}`);
  log.info('='.repeat(60));
}

// Singleton-shaped object preserving the getLogPath() contract used by ApiServer
export function getLogger() {
  return {
    getLogPath: () => log.transports.file.getFile().path,
    log: logInfo,
    error: logError,
    warn: logWarn,
  };
}
