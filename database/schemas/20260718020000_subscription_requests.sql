/*
# Subscription payment requests (manual verification)

1. New Tables
- `subscription_requests`: logged whenever a user selects a plan and taps
  "I've Paid" after scanning the admin's payment QR. status starts at
  'pending' and is updated manually by the admin (via Supabase Table
  Editor or the Advanced/SQL Editor) once the payment is confirmed —
  there is no payment gateway wired up yet, so this table is the queue
  the admin checks. When confirmed, the admin also updates the matching
  row in `profiles` (e.g. sets is_locked = false) to restore access.

2. Security (RLS)
- Users can insert and read their own requests only. There is no
  update/delete policy for regular users — status changes are an admin
  action performed with elevated access, not something the app exposes
  to end users (this prevents someone from marking their own request as
  "confirmed" to unlock the app without actually paying).
*/

CREATE TABLE IF NOT EXISTS subscription_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('1m','6m','1y')),
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
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
