/*
# KH Invoice — Create full database schema (consolidated)

This migration creates the complete database for the KH Invoice app in a single
pass. It consolidates 13 prior migrations into one idempotent script, with all
security fixes and the final corrected function bodies baked in.

## 1. New Tables

### profiles
- `id` (uuid, PK) — references auth.users, cascade on delete. One row per user.
- `business_name` (text) — vendor's business display name.
- `username` (text) — chosen username for the business.
- `phone` (text, unique) — vendor's phone number.
- `is_locked` (boolean, default false) — admin can lock an account.
- `trial_started_at` (timestamptz, default now()) — when the trial began.
- `created_at` (timestamptz, default now()).
- `qr_code_url` (text) — uploaded payment QR image URL.
- `avatar_url` (text) — business profile photo URL.
- `subscription_qr_url` (text) — admin's ABA KHQR payment image URL.

### transactions
- `id` (uuid, PK, auto-generated).
- `user_id` (uuid, not null, default auth.uid()) — owner; FK -> auth.users, cascade.
- `type` (text, not null) — 'income' or 'expense' (CHECK).
- `transaction_date` (date, not null, default current_date).
- `description` (text, not null).
- `quantity` (numeric, not null, default 1, must be > 0).
- `unit` (text) — unit of measure.
- `unit_price` (numeric, not null, must be > 0).
- `amount` (numeric, GENERATED ALWAYS AS quantity * unit_price, STORED).
- `currency` (text, not null, default 'USD') — 'USD' or 'KHR' (CHECK).
- `created_at` (timestamptz, default now()).
- Index on (user_id, transaction_date).

### custom_units
- `id` (uuid, PK, auto-generated).
- `user_id` (uuid, not null, default auth.uid()) — owner; FK -> auth.users, cascade.
- `name` (text, not null).
- `created_at` (timestamptz, default now()).
- Unique on (user_id, name).

### invoices
- `id` (uuid, PK, auto-generated).
- `user_id` (uuid, not null, default auth.uid()) — owner; FK -> auth.users, cascade.
- `invoice_number` (integer, not null) — auto-assigned by trigger.
- `customer_name` (text, not null, default '').
- `customer_phone` (text).
- `invoice_date` (date, not null, default current_date).
- `due_date` (date).
- `subtotal` (numeric, not null, default 0).
- `discount` (numeric, not null, default 0, must be >= 0).
- `paid_amount` (numeric, not null, default 0) — kept in sync by trigger.
- `balance` (numeric, GENERATED ALWAYS AS subtotal - discount - paid_amount, STORED).
- `currency` (text, not null, default 'USD').
- `notes` (text).
- `status` (text, not null, default 'unpaid') — 'unpaid' | 'partial' | 'paid'.
- `created_at` (timestamptz, default now()).

### invoice_items
- `id` (uuid, PK, auto-generated).
- `invoice_id` (uuid, not null) — FK -> invoices, cascade.
- `description` (text, not null, default '').
- `quantity` (numeric, not null, default 1).
- `unit` (text) — unit of measure for the line item.
- `unit_price` (numeric, not null, default 0).
- `total` (numeric, GENERATED ALWAYS AS quantity * unit_price, STORED).
- `product_id` (uuid, nullable) — FK -> products, ON DELETE SET NULL.
- `created_at` (timestamptz, default now()).

### invoice_payments
- `id` (uuid, PK, auto-generated).
- `invoice_id` (uuid, not null) — FK -> invoices, cascade.
- `amount` (numeric, not null, must be > 0).
- `note` (text).
- `payment_date` (date, not null, default current_date).
- `created_at` (timestamptz, default now()).

### products
- `id` (uuid, PK, auto-generated).
- `user_id` (uuid, not null, default auth.uid()) — owner; FK -> auth.users, cascade.
- `name` (text, not null).
- `unit` (text, not null, default 'ដុំ').
- `quantity` (numeric, not null, default 0) — derived from stock_movements by trigger.
- `cost_price` (numeric, not null, default 0, must be >= 0).
- `sell_price` (numeric, not null, default 0, must be >= 0).
- `low_stock_threshold` (numeric, not null, default 5, must be >= 0).
- `currency` (text, not null, default 'USD') — 'USD' or 'KHR'.
- `is_active` (boolean, not null, default true).
- `created_at` (timestamptz, default now()).
- Index on user_id.

### stock_movements
- `id` (uuid, PK, auto-generated).
- `product_id` (uuid, not null) — FK -> products, cascade.
- `user_id` (uuid, not null, default auth.uid()) — owner; FK -> auth.users, cascade.
- `type` (text, not null) — 'in' | 'out' | 'adjust' (CHECK).
- `quantity` (numeric, not null, must be > 0; sign applied by trigger based on type).
- `note` (text).
- `movement_date` (date, not null, default current_date).
- `created_at` (timestamptz, default now()).
- Index on (product_id, movement_date).

### subscription_requests
- `id` (uuid, PK, auto-generated).
- `user_id` (uuid, not null, default auth.uid()) — owner; FK -> auth.users, cascade.
- `plan` (text, not null) — '1m' | '6m' | '1y' (CHECK).
- `amount` (numeric, not null).
- `discount` (numeric, not null, default 0).
- `description` (text) — context about the payment.
- `status` (text, not null, default 'pending') — 'pending' | 'confirmed' | 'rejected' (CHECK).
- `transaction_id` (text) — ABA transaction id for matching.
- `payment_date` (date) — when the user paid.
- `proof_url` (text) — optional receipt screenshot URL.
- `created_at` (timestamptz, default now()).
- Index on (user_id, created_at).
- Users can SELECT/INSERT their own rows only (no UPDATE/DELETE for end users —
  status changes are an admin action).

## 2. Sequences + Triggers + Functions

- `user_invoice_seq` — global sequence for invoice numbers.
- `assign_invoice_number()` — BEFORE INSERT on invoices; assigns next invoice_number.
  SECURITY DEFINER, search_path = public. EXECUTE revoked from anon/authenticated/PUBLIC.
- `sync_invoice_paid_amount()` — AFTER INSERT/UPDATE/DELETE on invoice_payments;
  recalculates invoices.paid_amount and sets status to 'unpaid'|'partial'|'paid'
  comparing total paid against (subtotal - discount). SECURITY DEFINER,
  search_path = public, pg_temp.
- `sync_product_quantity()` — AFTER INSERT/UPDATE/DELETE on stock_movements;
  recalculates products.quantity as sum(in) - sum(out) + sum(adjust). SECURITY DEFINER,
  search_path = public. EXECUTE revoked from anon/authenticated/PUBLIC.

## 3. Storage

- `qr-codes` public bucket for QR code and avatar image uploads.
- Storage policies (on storage.objects, scoped to bucket_id = 'qr-codes'):
  - `qr_upload_own` — INSERT for authenticated.
  - `qr_update_own` — UPDATE for authenticated.
  - `qr_delete_own` — DELETE for authenticated.
  (Public read is handled by the bucket being public; no SELECT policy needed.)

## 4. Security (Row Level Security)

All tables enable RLS. This is a signed-in app, so all policies are scoped
TO authenticated with ownership checks via auth.uid(). Owner columns default
to auth.uid() so inserts that omit user_id still satisfy WITH CHECK.

- profiles: owner is the row's id (auth.uid() = id). 4 policies.
- transactions: owner is user_id. 4 policies.
- custom_units: owner is user_id. 4 policies.
- invoices: owner is user_id. 4 policies.
- invoice_items: owner-scoped via parent invoice (EXISTS subquery). 4 policies.
- invoice_payments: owner-scoped via parent invoice (EXISTS subquery). 4 policies.
- products: owner is user_id. 4 policies.
- stock_movements: owner is user_id. 4 policies.
- subscription_requests: owner is user_id. SELECT + INSERT only (no UPDATE/DELETE).

## 5. Important Notes

1. All statements use IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE for
   policies, making the migration fully idempotent and safe to re-run.
2. Trigger functions are SECURITY DEFINER with pinned search_path to prevent
   search-path hijacking. EXECUTE is revoked from all client roles so the
   functions cannot be called via REST RPC — only by the trigger engine.
3. No destructive operations are performed.
4. Email confirmation is expected to be OFF (the app uses phone-derived fake emails).
*/

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid references auth.users on delete cascade primary key,
  business_name text,
  username text,
  phone text unique,
  is_locked boolean default false,
  trial_started_at timestamptz default now(),
  created_at timestamptz default now(),
  qr_code_url text,
  avatar_url text,
  subscription_qr_url text
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============ transactions ============
CREATE TABLE IF NOT EXISTS transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  type text check (type in ('income','expense')) not null,
  transaction_date date not null default current_date,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text,
  unit_price numeric not null check (unit_price > 0),
  amount numeric generated always as (quantity * unit_price) stored,
  currency text check (currency in ('USD','KHR')) not null default 'USD',
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_transactions" ON transactions;
CREATE POLICY "insert_own_transactions" ON transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_transactions" ON transactions;
CREATE POLICY "update_own_transactions" ON transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_transactions" ON transactions;
CREATE POLICY "delete_own_transactions" ON transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ custom_units ============
CREATE TABLE IF NOT EXISTS custom_units (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

ALTER TABLE custom_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_units" ON custom_units;
CREATE POLICY "select_own_units" ON custom_units FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_units" ON custom_units;
CREATE POLICY "insert_own_units" ON custom_units FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_units" ON custom_units;
CREATE POLICY "update_own_units" ON custom_units FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_units" ON custom_units;
CREATE POLICY "delete_own_units" ON custom_units FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ products ============
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'ដុំ',
  quantity numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sell_price numeric NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  low_stock_threshold numeric NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','KHR')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_products" ON products;
CREATE POLICY "select_own_products" ON products FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_products" ON products;
CREATE POLICY "update_own_products" ON products FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ stock_movements ============
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in','out','adjust')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  note text,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, movement_date);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_stock_movements" ON stock_movements;
CREATE POLICY "select_own_stock_movements" ON stock_movements FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_stock_movements" ON stock_movements;
CREATE POLICY "insert_own_stock_movements" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_stock_movements" ON stock_movements;
CREATE POLICY "update_own_stock_movements" ON stock_movements FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_stock_movements" ON stock_movements;
CREATE POLICY "delete_own_stock_movements" ON stock_movements FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ invoices ============
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number integer NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0 CHECK (discount >= 0),
  paid_amount numeric NOT NULL DEFAULT 0,
  balance numeric GENERATED ALWAYS AS (subtotal - discount - paid_amount) STORED,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoices" ON invoices;
CREATE POLICY "select_own_invoices" ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_invoices" ON invoices;
CREATE POLICY "insert_own_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_invoices" ON invoices;
CREATE POLICY "update_own_invoices" ON invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_invoices" ON invoices;
CREATE POLICY "delete_own_invoices" ON invoices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ invoice_items ============
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoice_items" ON invoice_items;
CREATE POLICY "select_own_invoice_items" ON invoice_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_invoice_items" ON invoice_items;
CREATE POLICY "insert_own_invoice_items" ON invoice_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_invoice_items" ON invoice_items;
CREATE POLICY "update_own_invoice_items" ON invoice_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_invoice_items" ON invoice_items;
CREATE POLICY "delete_own_invoice_items" ON invoice_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

-- ============ invoice_payments ============
CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoice_payments" ON invoice_payments;
CREATE POLICY "select_own_invoice_payments" ON invoice_payments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_invoice_payments" ON invoice_payments;
CREATE POLICY "insert_own_invoice_payments" ON invoice_payments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_invoice_payments" ON invoice_payments;
CREATE POLICY "update_own_invoice_payments" ON invoice_payments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_invoice_payments" ON invoice_payments;
CREATE POLICY "delete_own_invoice_payments" ON invoice_payments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

-- ============ subscription_requests ============
CREATE TABLE IF NOT EXISTS subscription_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('1m','6m','1y')),
  amount numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  transaction_id text,
  payment_date date,
  proof_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_user ON subscription_requests(user_id, created_at);

ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription_requests" ON subscription_requests;
CREATE POLICY "select_own_subscription_requests" ON subscription_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscription_requests" ON subscription_requests;
CREATE POLICY "insert_own_subscription_requests" ON subscription_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ Sequences + Trigger Functions ============
CREATE SEQUENCE IF NOT EXISTS user_invoice_seq;

CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  next_num := nextval('user_invoice_seq');
  NEW.invoice_number := next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON invoices;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION assign_invoice_number();

REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM PUBLIC;

CREATE OR REPLACE FUNCTION sync_invoice_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_invoice_id uuid;
  total_paid numeric;
  inv_due numeric;
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM invoice_payments WHERE invoice_id = target_invoice_id;

  SELECT (subtotal - discount) INTO inv_due FROM invoices WHERE id = target_invoice_id;

  UPDATE invoices
  SET paid_amount = total_paid,
      status = CASE
        WHEN total_paid <= 0 THEN 'unpaid'
        WHEN total_paid >= inv_due THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = target_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_paid_amount ON invoice_payments;
CREATE TRIGGER trg_sync_invoice_paid_amount
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_invoice_paid_amount();

REVOKE EXECUTE ON FUNCTION public.sync_invoice_paid_amount() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_invoice_paid_amount() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_invoice_paid_amount() FROM PUBLIC;

CREATE OR REPLACE FUNCTION sync_product_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_product_id uuid;
  total_qty numeric;
BEGIN
  target_product_id := COALESCE(NEW.product_id, OLD.product_id);

  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'in' THEN quantity
      WHEN type = 'out' THEN -quantity
      WHEN type = 'adjust' THEN quantity
      ELSE 0
    END
  ), 0) INTO total_qty
  FROM stock_movements WHERE product_id = target_product_id;

  UPDATE products SET quantity = total_qty WHERE id = target_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_quantity ON stock_movements;
CREATE TRIGGER trg_sync_product_quantity
  AFTER INSERT OR UPDATE OR DELETE ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_quantity();

REVOKE EXECUTE ON FUNCTION public.sync_product_quantity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_product_quantity() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_quantity() FROM PUBLIC;

-- ============ Storage bucket + policies ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qr_upload_own" ON storage.objects;
CREATE POLICY "qr_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_update_own" ON storage.objects;
CREATE POLICY "qr_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-codes')
  WITH CHECK (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_delete_own" ON storage.objects;
CREATE POLICY "qr_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qr-codes');
