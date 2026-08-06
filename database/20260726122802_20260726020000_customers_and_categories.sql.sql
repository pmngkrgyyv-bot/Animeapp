/*
# Customers and Transaction Categories

## Purpose
Adds two missing features:
1. **Customer management** — a dedicated `customers` table so the app can store customer profiles (name, phone, address, note) separately from invoices, then link invoices to a customer by ID. This enables a customer detail view with purchase history.
2. **Transaction categories** — a `transaction_categories` table so income/expense transactions can be tagged with a category (rent, electricity, salary, marketing, etc.). This enables expense-by-category breakdown in reports.

## New Tables

### customers
- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to auth.uid()) — owner. FK -> auth.users, cascade.
- `name` (text, not null) — customer display name.
- `phone` (text, nullable) — phone number.
- `address` (text, nullable) — address.
- `note` (text, nullable) — free-form note.
- `created_at` (timestamptz, default now())

### transaction_categories
- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to auth.uid()) — owner. FK -> auth.users, cascade.
- `name` (text, not null) — category name (e.g. "Rent", "Electricity").
- `type` (text, not null, check in ('income','expense')) — which transaction type this category applies to.
- `color` (text, nullable) — optional hex color for UI badges.
- `created_at` (timestamptz, default now())
- Unique constraint on (user_id, name, type) so a user cannot duplicate the same name+type.

## Modified Tables

### transactions
- Added `category_id` (uuid, nullable) — FK -> transaction_categories, ON DELETE SET NULL.
  Nullable so existing transactions (and auto-generated invoice/stock transactions) keep working without a category.

### invoices
- Added `customer_id` (uuid, nullable) — FK -> customers, ON DELETE SET NULL.
  Nullable so existing invoices keep working. The existing `customer_name` text column remains as a fallback / snapshot.

## Security (RLS)
- `customers`: 4 owner-scoped policies (select/insert/update/delete), `TO authenticated`, `auth.uid() = user_id`.
- `transaction_categories`: 4 owner-scoped policies (select/insert/update/delete), `TO authenticated`, `auth.uid() = user_id`.

## Indexes
- `idx_customers_user` on customers(user_id)
- `idx_transaction_categories_user` on transaction_categories(user_id, type)
- `idx_transactions_category` on transactions(category_id)
- `idx_invoices_customer` on invoices(customer_id)

## Notes
1. All new columns are nullable + default-free so existing rows and existing insert paths keep working.
2. `ON DELETE SET NULL` on both FKs means deleting a customer or category does NOT delete linked transactions/invoices — it just unlinks them.
3. Seed data is NOT inserted here; the app offers to create default categories on first load.
*/
