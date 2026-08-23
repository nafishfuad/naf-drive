import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent dev seed. Creates nothing user-visible — just proves the schema
 * round-trips. Real users arrive via Supabase auth (UsersService.ensureUser).
 */
async function main(): Promise<void> {
  const demoSupabaseId = '00000000-0000-4000-8000-000000000000';

  await prisma.user.upsert({
    where: { supabaseUserId: demoSupabaseId },
    update: {},
    create: {
      id: demoSupabaseId,
      supabaseUserId: demoSupabaseId,
      email: 'demo@nafdrive.local',
      displayName: 'Demo User',
    },
  });

  const [users, nodes, connections] = await Promise.all([
    prisma.user.count(),
    prisma.node.count(),
    prisma.providerConnection.count(),
  ]);

  console.log(`Seed ok — users:${users} nodes:${nodes} connections:${connections}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
