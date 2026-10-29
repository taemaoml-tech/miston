import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool';

const DATABASE_DIR = path.resolve(__dirname, '../../../database');

/**
 * Порядок жорстко фіксований: спершу базова схема, потім міграції за іменем.
 * Файли застосовуються рівно один раз — це важливо, бо schema.sql створює
 * типи без `IF NOT EXISTS` і другий прогін ламається.
 */
function plannedFiles(): string[] {
  const migrations = fs.readdirSync(path.join(DATABASE_DIR, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  return ['schema.sql', ...migrations.map((file) => `migrations/${file}`)];
}

async function appliedFiles(): Promise<Set<string>> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const rows = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(rows.rows.map((row) => row.name));
}

async function isInitialized(): Promise<boolean> {
  const rows = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') AS exists`,
  );
  return rows.rows[0]?.exists === true;
}

async function apply(name: string): Promise<void> {
  const sql = await fs.promises.readFile(path.join(DATABASE_DIR, name), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`застосовано: ${name}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const files = plannedFiles();
  const done = await appliedFiles();

  if (done.size === 0 && (await isInitialized())) {
    if (!process.argv.includes('--baseline')) {
      throw new Error(
        'База вже ініціалізована вручну (таблиця users є, журналу немає). '
        + 'Познач наявні файли застосованими: npm run migrate -w server -- --baseline',
      );
    }
    for (const file of files) {
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
    }
    console.log(`позначено застосованими без виконання: ${files.length}`);
    return;
  }

  const pending = files.filter((file) => !done.has(file));
  if (pending.length === 0) {
    console.log('міграцій застосовувати не потрібно');
    return;
  }
  for (const file of pending) await apply(file);
  console.log(`готово: ${pending.length} з ${files.length}`);
}

main()
  .catch((error: unknown) => {
    console.error('Міграції не застосовано:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
