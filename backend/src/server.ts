import { app } from './app.js';
import { env, getAuthEnv } from './config/env.js';
import { startStateBackupScheduler, stopStateBackupScheduler } from './jobs/state-backup.scheduler.js';

getAuthEnv();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${env.PORT}`);
});

startStateBackupScheduler();

const shutdown = () => {
  stopStateBackupScheduler();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
