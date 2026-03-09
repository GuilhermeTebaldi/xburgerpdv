ALTER TABLE users ADD COLUMN IF NOT EXISTS state_owner_user_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name varchar(120);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_state_owner_user_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_state_owner_user_id_fkey
      FOREIGN KEY (state_owner_user_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS users_state_owner_user_id_idx
  ON users (state_owner_user_id);

CREATE INDEX IF NOT EXISTS users_company_name_idx
  ON users (company_name);

UPDATE users
SET state_owner_user_id = id
WHERE state_owner_user_id IS NULL;
