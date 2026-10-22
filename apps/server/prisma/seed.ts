import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROOMS } from '@nightshift/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding NIGHTSHIFT rooms...');

  for (const r of DEFAULT_ROOMS) {
    const existing = await prisma.room.findUnique({
      where: { name: r.name },
    });

    if (!existing) {
      await prisma.room.create({
        data: {
          name: r.name,
          description: r.description,
          isDefault: true,
        },
      });
      console.log(`Created default room: "${r.name}"`);
    } else {
      console.log(`Room already exists: "${r.name}"`);
    }
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
