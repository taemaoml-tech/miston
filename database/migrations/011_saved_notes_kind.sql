-- Фаза 10A: особисті нотатки — розмова, де єдиний учасник це її власник.
-- Файл окремий від форми таблиці, бо Postgres забороняє використовувати нове
-- значення enum у тій самій транзакції, що його додає, а міграції йдуть
-- BEGIN/COMMIT цілим файлом (server/src/db/migrate.ts:41).
ALTER TYPE conversation_kind ADD VALUE IF NOT EXISTS 'saved';
