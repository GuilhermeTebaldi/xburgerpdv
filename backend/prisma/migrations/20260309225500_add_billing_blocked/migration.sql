ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_blocked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_billing_blocked_idx
  ON users (billing_blocked);
