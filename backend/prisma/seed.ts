import 'dotenv/config';

import bcrypt from 'bcryptjs';

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const run = async () => {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';

  if (!adminEmail || !adminPassword) {
    throw new Error('SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD são obrigatórios para seed.');
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      name: adminName,
      isActive: true,
    },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      name: adminName,
      isActive: true,
    },
  });

  const openSession = await prisma.operatingSession.findFirst({
    where: { status: 'OPEN' },
    orderBy: { startedAt: 'desc' },
  });

  if (!openSession) {
    await prisma.operatingSession.create({
      data: {
        status: 'OPEN',
      },
    });
  }
};

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
