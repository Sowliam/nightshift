import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load root and server .env if not already in process.env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

const dbUrl = (process.env.DATABASE_URL || '').trim();
const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');
const targetProvider = isPostgres ? 'postgresql' : 'sqlite';

try {
  let content = fs.readFileSync(schemaPath, 'utf8');
  const currentMatch = content.match(/provider\s*=\s*"(sqlite|postgresql)"/);

  if (currentMatch && currentMatch[1] !== targetProvider) {
    content = content.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${targetProvider}"`);
    fs.writeFileSync(schemaPath, content, 'utf8');
    console.log(`[PRISMA CONFIG] Switched database provider from ${currentMatch[1]} -> ${targetProvider}`);
  } else {
    console.log(`[PRISMA CONFIG] Database provider active: ${targetProvider}`);
  }
} catch (err) {
  console.warn('[PRISMA CONFIG] Error syncing database provider:', err);
}

