import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Applies database/schema.sql and every database/migrations/*.sql file once,
 * keeping track of applied files in schema_migrations (same convention as
 * the server's `npm run migrate`).
 */
export async function applyMigrations(db, databaseDir) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const rows = await db.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.rows.map((row) => row.name));

  const files = ['schema.sql'];
  try {
    const entries = (await fs.readdir(path.join(databaseDir, 'migrations')))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    files.push(...entries.map((file) => `migrations/${file}`));
  } catch {
    // no migrations folder — schema only
  }

  const existing = await db.query("SELECT to_regclass('public.users') AS users");
  if (existing.rows[0]?.users && done.size === 0) {
    // Database created before migration tracking existed: baseline it.
    for (const name of files) {
      await db.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [name],
      );
    }
    console.log('Baseline: existing database marked as fully migrated');
    return;
  }

  for (const name of files) {
    if (done.has(name)) continue;
    const sql = await fs.readFile(path.join(databaseDir, name), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
    console.log(`Applied ${name}`);
  }
}
