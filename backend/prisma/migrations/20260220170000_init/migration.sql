CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'OPERATOR', 'AUDITOR');
CREATE TYPE product_category AS ENUM ('SNACK', 'DRINK', 'SIDE');
CREATE TYPE session_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE sale_status AS ENUM ('ACTIVE', 'PARTIALLY_REFUNDED', 'REFUNDED');
CREATE TYPE refund_type AS ENUM ('FULL', 'PARTIAL');
CREATE TYPE stock_target_type AS ENUM ('INGREDIENT', 'CLEANING_MATERIAL');
CREATE TYPE stock_direction AS ENUM ('IN', 'OUT');
CREATE TYPE stock_movement_reason AS ENUM ('MANUAL', 'SALE', 'REFUND', 'SYSTEM');
CREATE TYPE action_origin AS ENUM ('API', 'SYSTEM', 'IMPORT');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  name varchar(120),
  role user_role NOT NULL DEFAULT 'ADMIN',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(80) UNIQUE,
  name varchar(120) NOT NULL,
  unit varchar(30) NOT NULL,
  current_stock numeric(14,4) NOT NULL,
  min_stock numeric(14,4) NOT NULL,
  cost numeric(14,4) NOT NULL,
  addon_price numeric(14,4),
  image_url varchar(1024),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredients_current_stock_non_negative CHECK (current_stock >= 0),
  CONSTRAINT ingredients_min_stock_non_negative CHECK (min_stock >= 0),
  CONSTRAINT ingredients_cost_non_negative CHECK (cost >= 0),
  CONSTRAINT ingredients_addon_price_non_negative CHECK (addon_price IS NULL OR addon_price >= 0)
);
CREATE INDEX ingredients_name_idx ON ingredients (name);

CREATE TABLE cleaning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(80) UNIQUE,
  name varchar(120) NOT NULL,
  unit varchar(30) NOT NULL,
  current_stock numeric(14,4) NOT NULL,
  min_stock numeric(14,4) NOT NULL,
  cost numeric(14,4) NOT NULL,
  image_url varchar(1024),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cleaning_materials_current_stock_non_negative CHECK (current_stock >= 0),
  CONSTRAINT cleaning_materials_min_stock_non_negative CHECK (min_stock >= 0),
  CONSTRAINT cleaning_materials_cost_non_negative CHECK (cost >= 0)
);
CREATE INDEX cleaning_materials_name_idx ON cleaning_materials (name);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(80) UNIQUE,
  name varchar(120) NOT NULL,
  price numeric(14,2) NOT NULL,
  image_url varchar(1024) NOT NULL,
  category product_category NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_price_non_negative CHECK (price >= 0)
);
CREATE INDEX products_name_idx ON products (name);

CREATE TABLE product_ingredients (
  product_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, ingredient_id),
  CONSTRAINT product_ingredients_quantity_positive CHECK (quantity > 0),
  CONSTRAINT product_ingredients_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT product_ingredients_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX product_ingredients_ingredient_id_idx ON product_ingredients (ingredient_id);

CREATE TABLE operating_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status session_status NOT NULL DEFAULT 'OPEN',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  opened_by_user_id uuid,
  closed_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operating_sessions_opened_by_user_id_fkey
    FOREIGN KEY (opened_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT operating_sessions_closed_by_user_id_fkey
    FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX operating_sessions_status_idx ON operating_sessions (status);
CREATE INDEX operating_sessions_started_at_idx ON operating_sessions (started_at);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(80) UNIQUE,
  session_id uuid NOT NULL,
  status sale_status NOT NULL DEFAULT 'ACTIVE',
  total_gross numeric(14,2) NOT NULL,
  total_net numeric(14,2) NOT NULL,
  total_cost numeric(14,4) NOT NULL,
  total_refunded numeric(14,2) NOT NULL DEFAULT 0,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_total_gross_non_negative CHECK (total_gross >= 0),
  CONSTRAINT sales_total_net_non_negative CHECK (total_net >= 0),
  CONSTRAINT sales_total_cost_non_negative CHECK (total_cost >= 0),
  CONSTRAINT sales_total_refunded_non_negative CHECK (total_refunded >= 0),
  CONSTRAINT sales_total_net_lte_total_gross CHECK (total_net <= total_gross),
  CONSTRAINT sales_total_refunded_lte_total_gross CHECK (total_refunded <= total_gross),
  CONSTRAINT sales_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES operating_sessions(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX sales_session_id_created_at_idx ON sales (session_id, created_at);
CREATE INDEX sales_status_created_at_idx ON sales (status, created_at);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name_snapshot varchar(120) NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  base_unit_price numeric(14,2),
  price_adjustment numeric(14,2),
  unit_cost numeric(14,4) NOT NULL,
  base_unit_cost numeric(14,4),
  line_total numeric(14,2) NOT NULL,
  line_cost numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sale_items_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT sale_items_unit_cost_non_negative CHECK (unit_cost >= 0),
  CONSTRAINT sale_items_line_total_non_negative CHECK (line_total >= 0),
  CONSTRAINT sale_items_line_cost_non_negative CHECK (line_cost >= 0),
  CONSTRAINT sale_items_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES sales(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT sale_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX sale_items_product_id_idx ON sale_items (product_id);

CREATE TABLE sale_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL,
  ingredient_id uuid,
  ingredient_name_snapshot varchar(120) NOT NULL,
  unit_snapshot varchar(30) NOT NULL,
  quantity numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  line_cost numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_item_ingredients_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sale_item_ingredients_unit_cost_non_negative CHECK (unit_cost >= 0),
  CONSTRAINT sale_item_ingredients_line_cost_non_negative CHECK (line_cost >= 0),
  CONSTRAINT sale_item_ingredients_sale_item_id_fkey
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT sale_item_ingredients_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX sale_item_ingredients_sale_item_id_idx ON sale_item_ingredients (sale_item_id);
CREATE INDEX sale_item_ingredients_ingredient_id_idx ON sale_item_ingredients (ingredient_id);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  type refund_type NOT NULL,
  reason varchar(400),
  total_amount numeric(14,2) NOT NULL,
  total_cost_reversed numeric(14,4) NOT NULL,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_total_amount_non_negative CHECK (total_amount >= 0),
  CONSTRAINT refunds_total_cost_reversed_non_negative CHECK (total_cost_reversed >= 0),
  CONSTRAINT refunds_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES sales(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT refunds_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX refunds_sale_id_created_at_idx ON refunds (sale_id, created_at);

CREATE TABLE refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  quantity integer NOT NULL,
  amount numeric(14,2) NOT NULL,
  cost_reversed numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT refund_items_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT refund_items_cost_reversed_non_negative CHECK (cost_reversed >= 0),
  CONSTRAINT refund_items_refund_id_fkey
    FOREIGN KEY (refund_id) REFERENCES refunds(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT refund_items_sale_item_id_fkey
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX refund_items_refund_id_idx ON refund_items (refund_id);
CREATE INDEX refund_items_sale_item_id_idx ON refund_items (sale_item_id);

CREATE TABLE refund_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_item_id uuid NOT NULL,
  sale_item_ingredient_id uuid NOT NULL,
  ingredient_id uuid,
  ingredient_name_snapshot varchar(120) NOT NULL,
  quantity numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  line_cost numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_item_ingredients_quantity_positive CHECK (quantity > 0),
  CONSTRAINT refund_item_ingredients_unit_cost_non_negative CHECK (unit_cost >= 0),
  CONSTRAINT refund_item_ingredients_line_cost_non_negative CHECK (line_cost >= 0),
  CONSTRAINT refund_item_ingredients_refund_item_id_fkey
    FOREIGN KEY (refund_item_id) REFERENCES refund_items(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT refund_item_ingredients_sale_item_ingredient_id_fkey
    FOREIGN KEY (sale_item_ingredient_id) REFERENCES sale_item_ingredients(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT refund_item_ingredients_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX refund_item_ingredients_refund_item_id_idx ON refund_item_ingredients (refund_item_id);
CREATE INDEX refund_item_ingredients_sale_item_ingredient_id_idx ON refund_item_ingredients (sale_item_ingredient_id);
CREATE INDEX refund_item_ingredients_ingredient_id_idx ON refund_item_ingredients (ingredient_id);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type stock_target_type NOT NULL,
  direction stock_direction NOT NULL,
  reason stock_movement_reason NOT NULL,
  quantity numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  total_cost numeric(14,4) NOT NULL,
  is_manual boolean NOT NULL DEFAULT false,
  note varchar(400),
  session_id uuid,
  sale_id uuid,
  refund_id uuid,
  ingredient_id uuid,
  cleaning_material_id uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_quantity_positive CHECK (quantity > 0),
  CONSTRAINT stock_movements_unit_cost_non_negative CHECK (unit_cost >= 0),
  CONSTRAINT stock_movements_total_cost_non_negative CHECK (total_cost >= 0),
  CONSTRAINT stock_movements_target_integrity CHECK (
    (target_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND cleaning_material_id IS NULL)
    OR
    (target_type = 'CLEANING_MATERIAL' AND cleaning_material_id IS NOT NULL AND ingredient_id IS NULL)
  ),
  CONSTRAINT stock_movements_reason_reference_integrity CHECK (
    (reason = 'SALE' AND sale_id IS NOT NULL)
    OR (reason = 'REFUND' AND refund_id IS NOT NULL)
    OR (reason IN ('MANUAL', 'SYSTEM'))
  ),
  CONSTRAINT stock_movements_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES operating_sessions(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT stock_movements_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES sales(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT stock_movements_refund_id_fkey
    FOREIGN KEY (refund_id) REFERENCES refunds(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT stock_movements_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT stock_movements_cleaning_material_id_fkey
    FOREIGN KEY (cleaning_material_id) REFERENCES cleaning_materials(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT stock_movements_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX stock_movements_target_type_created_at_idx ON stock_movements (target_type, created_at);
CREATE INDEX stock_movements_session_id_created_at_idx ON stock_movements (session_id, created_at);
CREATE INDEX stock_movements_ingredient_id_created_at_idx ON stock_movements (ingredient_id, created_at);
CREATE INDEX stock_movements_cleaning_material_id_created_at_idx ON stock_movements (cleaning_material_id, created_at);
CREATE INDEX stock_movements_sale_id_idx ON stock_movements (sale_id);
CREATE INDEX stock_movements_refund_id_idx ON stock_movements (refund_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name varchar(80) NOT NULL,
  entity_id varchar(80) NOT NULL,
  action varchar(80) NOT NULL,
  origin action_origin NOT NULL DEFAULT 'API',
  actor_user_id uuid,
  request_id varchar(120),
  ip_address varchar(64),
  user_agent varchar(512),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX audit_logs_entity_name_entity_id_created_at_idx ON audit_logs (entity_name, entity_id, created_at);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER ingredients_set_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER cleaning_materials_set_updated_at BEFORE UPDATE ON cleaning_materials FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER product_ingredients_set_updated_at BEFORE UPDATE ON product_ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER operating_sessions_set_updated_at BEFORE UPDATE ON operating_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER sale_items_set_updated_at BEFORE UPDATE ON sale_items FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER sale_item_ingredients_set_updated_at BEFORE UPDATE ON sale_item_ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER refund_items_set_updated_at BEFORE UPDATE ON refund_items FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER refund_item_ingredients_set_updated_at BEFORE UPDATE ON refund_item_ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER stock_movements_set_updated_at BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
