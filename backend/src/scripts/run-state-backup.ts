import { prisma } from '../db/prisma.js';
import { StateService } from '../services/state.service.js';

const service = new StateService();

const main = async () => {
  const result = await service.runDailyBackup();
  // eslint-disable-next-line no-console
  console.log(
    `[state-backup] daily=${result.backupDay} created=${result.created} version=${result.sourceVersion} pruned=${result.prunedCount}`
  );
};

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[state-backup] failed to run backup', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
