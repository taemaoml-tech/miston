-- Додаємо тип розмови 'meeting' для зустрічей (Google Meet-подібні кімнати).
ALTER TYPE conversation_kind ADD VALUE IF NOT EXISTS 'meeting';
