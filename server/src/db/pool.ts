import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config/env';

// Зовнішні з'єднання Render і Neon вимагають TLS; внутрішні мережеві з'єднання
// Render підтримують його опційно з самопідписаним сертифікатом.
function tlsOptions(): PoolConfig['ssl'] {
  switch (config.DB_SSL) {
    case 'disable':
      return undefined;
    case 'require':
      return { rejectUnauthorized: false };
    case 'verify':
      return { rejectUnauthorized: true };
    default:
      return config.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined;
  }
}

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: tlsOptions(),
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values as unknown[]);
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
