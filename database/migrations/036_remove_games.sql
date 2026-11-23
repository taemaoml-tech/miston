-- Ігри видалено з Miston. Очищуємо таблиці, колонки та службові повідомлення,
-- які створювала функція ігор. Мітку enum 'game' лишаємо недоторканою: PostgreSQL
-- не підтримує безпечне видалення значень enum, а жоден код її більше не використовує.

DROP INDEX IF EXISTS messages_game_idx;
ALTER TABLE messages DROP COLUMN IF EXISTS game_id;

DROP TABLE IF EXISTS game_moves;
DROP TABLE IF EXISTS game_players;
DROP TABLE IF EXISTS games;

DELETE FROM messages WHERE kind = 'game';
