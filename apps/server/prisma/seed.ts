import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('NIGHTSHIFT database initialized. Clean slate: No fake mock users or servers created.');
}

main()
  .catch((e) => {
    console.error('Database initialization error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
