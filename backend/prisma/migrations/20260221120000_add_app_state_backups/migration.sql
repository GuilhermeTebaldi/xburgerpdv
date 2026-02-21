DO $$
BEGIN
  CREATE TYPE app_state_backup_kind AS ENUM ('PRE_WRITE', 'DAILY', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS app_state_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind app_state_backup_kind NOT NULL,
  source_version varchar(80) NOT NULL,
  backup_day date,
  state_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_state_backups_backup_day_kind_key
  ON app_state_backups (backup_day, kind);

CREATE INDEX IF NOT EXISTS app_state_backups_kind_created_at_idx
  ON app_state_backups (kind, created_at);

CREATE INDEX IF NOT EXISTS app_state_backups_source_version_idx
  ON app_state_backups (source_version);
