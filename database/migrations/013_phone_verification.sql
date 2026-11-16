-- Phone number verification (Twilio SMS, 8-digit codes)

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_unique
  ON users (phone_number) WHERE phone_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verification_codes_user_idx
  ON phone_verification_codes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS phone_verification_codes_pending_idx
  ON phone_verification_codes (user_id) WHERE consumed_at IS NULL;
