CREATE TABLE IF NOT EXISTS user_print_preferences (
  user_id uuid PRIMARY KEY,
  history_closing_preset varchar(20),
  cash_report_preset varchar(20),
  receipt_history_preset varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_print_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
