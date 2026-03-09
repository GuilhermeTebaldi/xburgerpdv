import 'dotenv/config';

import bcrypt from 'bcryptjs';

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const run = async () => {
  const envAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const envAdminPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
  const adminEmail = envAdminEmail || 'admin@xburgerpdv.com.br';
  const adminPassword = envAdminPassword || 'Xburger@123456';
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';

  if (!envAdminEmail || !envAdminPassword) {
    console.warn(
      '[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos. Usando credenciais padrão de bootstrap XBurger.',
    );
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
