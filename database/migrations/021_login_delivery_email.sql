-- Логін-коди тепер доставляються через email (замість SMS), тому додаємо 'email'
-- до допустимих значень delivery у login_challenges.

ALTER TABLE login_challenges DROP CONSTRAINT IF EXISTS login_challenges_delivery_check;

ALTER TABLE login_challenges ADD CONSTRAINT login_challenges_delivery_check
  CHECK (delivery IN ('miston', 'email', 'sms'));
