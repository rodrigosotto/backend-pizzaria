// Carrega o .env ANTES de qualquer import que use process.env
import { config } from 'dotenv';
config();

import path from 'path';
import { defineConfig } from 'prisma/config';

const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!directUrl && !databaseUrl) {
  throw new Error('DIRECT_URL ou DATABASE_URL não encontradas no .env');
}

export default defineConfig({
  schema: path.join(__dirname, 'schema.prisma'),
  datasource: {
    // DIRECT_URL → host direto do Supabase (db.xxx.supabase.co:5432) — obrigatório para migrations
    // DATABASE_URL → pooler com pgbouncer (port 6543) — NÃO funciona para migrations
    url: directUrl ?? databaseUrl ?? '',
  },
});
