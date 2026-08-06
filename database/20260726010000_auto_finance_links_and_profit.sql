/*
# Auto-link Finance to Invoices & Stock, add Gross Profit tracking, add optional Stock module

Problem being fixed:
- Invoice payments (invoice_payments) never created a row in `transactions`,
  so paid invoice revenue did not show up in the Home/Finance income totals.
- Stock restocks (stock_movements type='in') never created an expense
  transaction, so inventory purchases did not show up in Finance expenses.
- Nothing captured the product's cost_price at the moment it was sold, so
  gross profit (revenue - cost of goods sold) could never be computed.
- The Stock module could not be turned off for service businesses that
  don't carry inventory.

## 1. Modified Tables

### transactions
- `source` (text, default 'manual') — 'manual' | 'invoice' | 'stock'.
  Lets the UI tell which rows were entered by hand vs auto-generated, and
  lets auto-generated rows be found/replaced without duplicating them.
- `reference_id` (uuid, nullable) — the invoice id or stock_movement id
  that generated this row, when source != 'manual'.
- Unique partial index on (reference_id, source) where source != 'manual'
  so an invoice/stock movement can only ever back ONE transaction row —
  re-saving an invoice updates its linked row instead of duplicating it.

### invoice_items
- `cost_price` (numeric, nullable) — snapshot of the linked product's
  cost_price at the moment the invoice was saved. Snapshotting (rather
  than joining live to `products`) keeps historical profit figures correct
  even if a product's cost changes later.

### profiles
- `stock_module_enabled` (boolean, default true) — lets a business turn
  the Stock tab off entirely (e.g. service businesses with no inventory).

## 2. Security (RLS)
No new tables, so no new RLS policies are needed — the modified columns
inherit the existing owner-scoped policies on `transactions`,
`invoice_items`, and `profiles`.

## 3. Notes
- All changes use ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
  safe to re-run.
- This migration does NOT backfill historical invoices/stock movements
  into `transactions` — only new activity going forward is linked. Ask
  before backfilling if historical reports need to match too.
*/

-- 1. transactions: source + reference_id
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_source_check'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_source_check CHECK (source IN ('manual','invoice','stock'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_reference
  ON transactions (reference_id, source)
  WHERE source <> 'manual';

-- 2. invoice_items: cost_price snapshot for gross profit
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS cost_price numeric;

-- 3. profiles: optional Stock module
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stock_module_enabled boolean NOT NULL DEFAULT true;
