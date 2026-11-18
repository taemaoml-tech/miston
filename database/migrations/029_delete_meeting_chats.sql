-- Видаляємо всі Google Meet-подібні чати зустрічей.
-- Учасники, повідомлення, вкладення та історія дзвінків видаляються каскадно
-- завдяки зовнішнім ключам ON DELETE CASCADE.
DELETE FROM conversations WHERE kind = 'meeting';
