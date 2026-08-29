import { Cron } from 'croner';
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('scheduler');

/** Active cron jobs keyed by `${flowTNodeId}:${nodeId}` */
const activeJobs = new Map<string, Cron>();

/**
 * Register a cron job that fires the given callback on each tick.
 */
export function registerSchedule(key: string, cronExpression: string, callback: () => void): void {
  // Unregister any existing job with this key first
  unregisterSchedule(key);

  try {
    const job = new Cron(cronExpression, () => {
      try {
        callback();
      } catch (err) {
        logger.error(`Schedule ${key} tick failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    activeJobs.set(key, job);
    logger.info(`Registered schedule: ${key} (${cronExpression})`);
  } catch (err) {
    logger.error(`Failed to register schedule ${key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Stop and remove a single cron job by key.
 */
export function unregisterSchedule(key: string): void {
  const job = activeJobs.get(key);
  if (job) {
    job.stop();
    activeJobs.delete(key);
  }
}

/**
 * Stop and remove all cron jobs whose key starts with the given prefix.
 * Used to clean up all jobs for a specific flow actor.
 */
export function unregisterByPrefix(prefix: string): void {
  const prefixWithSep = prefix + ':';
  for (const [key, job] of activeJobs) {
    if (key.startsWith(prefixWithSep)) {
      job.stop();
      activeJobs.delete(key);
    }
  }
}

/**
 * Stop and remove all cron jobs. Called on brain kill/restart.
 */
export function clearAllSchedules(): void {
  for (const job of activeJobs.values()) {
    job.stop();
  }
  activeJobs.clear();
  logger.info('Cleared all schedules');
}
