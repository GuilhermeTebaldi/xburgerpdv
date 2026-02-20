CREATE TABLE app_state (
  id integer PRIMARY KEY DEFAULT 1,
  state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_state_singleton CHECK (id = 1)
);

INSERT INTO app_state (id, state_json)
VALUES (
  1,
  jsonb_build_object(
    'ingredients', '[]'::jsonb,
    'products', '[]'::jsonb,
    'sales', '[]'::jsonb,
    'stockEntries', '[]'::jsonb,
    'cleaningMaterials', '[]'::jsonb,
    'cleaningStockEntries', '[]'::jsonb,
    'globalSales', '[]'::jsonb,
    'globalCancelledSales', '[]'::jsonb,
    'globalStockEntries', '[]'::jsonb,
    'globalCleaningStockEntries', '[]'::jsonb
  )
)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER app_state_set_updated_at
BEFORE UPDATE ON app_state
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
