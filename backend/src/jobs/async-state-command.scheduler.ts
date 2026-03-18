import { env } from '../config/env.js';
import { AsyncStateCommandQueueService } from '../services/async-state-command-queue.service.js';

const queueService = new AsyncStateCommandQueueService();

let schedulerHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runQueueCycle = async (): Promise<void> => {
  if (isRunning) return;
  isRunning = true;
  try {
    await queueService.processDueJobs();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[async-state-command-queue] worker cycle failed', error);
  } finally {
    isRunning = false;
  }
};

export const startAsyncStateCommandScheduler = (): void => {
  if (!env.ASYNC_STATE_COMMAND_QUEUE_ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[async-state-command-queue] scheduler disabled by ASYNC_STATE_COMMAND_QUEUE_ENABLED');
    return;
  }

  const intervalMs = env.ASYNC_STATE_COMMAND_QUEUE_POLL_INTERVAL_MS;
  schedulerHandle = setInterval(() => {
    void runQueueCycle();
  }, intervalMs);
  schedulerHandle.unref?.();

  void runQueueCycle();
  // eslint-disable-next-line no-console
  console.log(`[async-state-command-queue] scheduler started (poll interval ${intervalMs}ms)`);
};

export const stopAsyncStateCommandScheduler = (): void => {
  if (!schedulerHandle) return;
  clearInterval(schedulerHandle);
  schedulerHandle = null;
};
