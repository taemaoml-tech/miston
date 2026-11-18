-- Вхід через QR: пристрій без сесії створює короткоживучий запит, а телефон
-- (де вже увійшли) підтверджує його скануванням у Налаштуваннях.
-- Окремо від mist_qr_tokens: там токен видає залогінений пристрій і його
-- вводять вручну, тут — навпаки, QR показує новий пристрій.
CREATE TABLE IF NOT EXISTS mist_qr_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mist_qr_login_sessions_token_idx ON mist_qr_login_sessions (token);
