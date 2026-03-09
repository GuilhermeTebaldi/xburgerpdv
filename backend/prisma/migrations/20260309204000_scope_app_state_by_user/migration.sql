ALTER TABLE app_state DROP CONSTRAINT IF EXISTS app_state_singleton;

ALTER TABLE app_state ADD COLUMN IF NOT EXISTS owner_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_state_owner_user_id_fkey'
  ) THEN
    ALTER TABLE app_state
      ADD CONSTRAINT app_state_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS app_state_owner_user_id_key
  ON app_state (owner_user_id);

CREATE INDEX IF NOT EXISTS app_state_owner_user_id_idx
  ON app_state (owner_user_id);

ALTER TABLE app_state ALTER COLUMN id DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'app_state_id_seq'
  ) THEN
    CREATE SEQUENCE app_state_id_seq OWNED BY app_state.id;
  END IF;
END
$$;

SELECT setval('app_state_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM app_state), 0), 1), true);

ALTER TABLE app_state ALTER COLUMN id SET DEFAULT nextval('app_state_id_seq');

ALTER TABLE app_state_backups ADD COLUMN IF NOT EXISTS owner_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_state_backups_owner_user_id_fkey'
  ) THEN
    ALTER TABLE app_state_backups
      ADD CONSTRAINT app_state_backups_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DROP INDEX IF EXISTS app_state_backups_backup_day_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS app_state_backups_owner_user_id_backup_day_kind_key
  ON app_state_backups (owner_user_id, backup_day, kind);

CREATE INDEX IF NOT EXISTS app_state_backups_owner_kind_created_at_idx
  ON app_state_backups (owner_user_id, kind, created_at);
