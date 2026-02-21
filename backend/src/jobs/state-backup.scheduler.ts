import { env } from '../config/env.js';
import { StateService } from '../services/state.service.js';

let schedulerHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const stateService = new StateService();

const runBackupCycle = async (): Promise<void> => {
  if (isRunning) return;
  isRunning = true;
  try {
    const result = await stateService.runDailyBackup();
    // eslint-disable-next-line no-console
    console.log(
      `[state-backup] daily=${result.backupDay} created=${result.created} version=${result.sourceVersion} pruned=${result.prunedCount}`
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[state-backup] backup cycle failed', error);
  } finally {
    isRunning = false;
  }
};

export const startStateBackupScheduler = (): void => {
  if (!env.APP_STATE_BACKUP_SCHEDULER_ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[state-backup] scheduler disabled by APP_STATE_BACKUP_SCHEDULER_ENABLED');
    return;
  }

  const intervalMs = env.APP_STATE_BACKUP_CHECK_INTERVAL_MS;
  schedulerHandle = setInterval(() => {
    void runBackupCycle();
  }, intervalMs);
  schedulerHandle.unref?.();

  // Execute once on startup to guarantee at least one daily snapshot.
  void runBackupCycle();
  // eslint-disable-next-line no-console
  console.log(`[state-backup] scheduler started (check interval ${intervalMs}ms)`);
};

export const stopStateBackupScheduler = (): void => {
  if (!schedulerHandle) return;
  clearInterval(schedulerHandle);
  schedulerHandle = null;
};
