ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_blocked_message varchar(600),
  ADD COLUMN IF NOT EXISTS billing_blocked_until timestamptz;

CREATE INDEX IF NOT EXISTS users_billing_blocked_until_idx
  ON users (billing_blocked_until);
