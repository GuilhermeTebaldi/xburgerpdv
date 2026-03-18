DO $$
BEGIN
  CREATE TYPE async_state_command_job_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'RETRY_PENDING',
    'SUCCEEDED',
    'FAILED_PERMANENT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS async_state_command_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  actor_user_id uuid,
  command_type varchar(80) NOT NULL,
  draft_id varchar(200) NOT NULL,
  command_id varchar(200),
  status async_state_command_job_status NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error varchar(600),
  last_error_code integer,
  last_error_details jsonb,
  result_version varchar(80),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT async_state_command_jobs_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT async_state_command_jobs_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT async_state_command_jobs_attempt_count_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT async_state_command_jobs_max_attempts_positive CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS async_state_command_jobs_owner_status_available_created_idx
  ON async_state_command_jobs (owner_user_id, status, available_at, created_at);

CREATE INDEX IF NOT EXISTS async_state_command_jobs_status_available_created_idx
  ON async_state_command_jobs (status, available_at, created_at);

CREATE INDEX IF NOT EXISTS async_state_command_jobs_owner_draft_command_created_idx
  ON async_state_command_jobs (owner_user_id, draft_id, command_type, created_at);

CREATE INDEX IF NOT EXISTS async_state_command_jobs_lease_until_idx
  ON async_state_command_jobs (lease_until);
