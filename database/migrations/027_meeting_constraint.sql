-- Додаємо 'meeting' до CHECK-обмеження direct_shape.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS direct_shape;

ALTER TABLE conversations ADD CONSTRAINT direct_shape CHECK (
  (kind = 'direct' AND direct_key IS NOT NULL AND server_id IS NULL AND title IS NULL)
  OR (kind = 'saved' AND direct_key IS NOT NULL AND server_id IS NULL AND title IS NULL)
  OR (kind = 'group' AND direct_key IS NULL AND server_id IS NULL AND title IS NOT NULL)
  OR (kind = 'channel' AND direct_key IS NULL AND server_id IS NOT NULL AND title IS NOT NULL)
  OR (kind = 'meeting' AND direct_key IS NULL AND server_id IS NULL AND title IS NOT NULL)
);
