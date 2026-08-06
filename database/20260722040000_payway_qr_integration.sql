/*
# PayWay (ABA) KHQR automatic payment verification

1. Problem
- Today a user selects a plan, scans a *static* QR image, and manually
  types in a transaction id / uploads a screenshot. An admin must then
  open Supabase and manually flip `subscription_requests.status` to
  'confirmed' and unlock the profile. This migration adds the columns
  and the trigger needed so that flipping status to 'confirmed' (done
  automatically by the `check-qr-status` Edge Function once PayWay
  confirms the payment, or still manually by an admin for edge cases)
  unlocks the account and extends the paid-until date by itself.

2. New columns
- `subscription_requests.payway_tran_id` (text, unique, nullable): the
  transaction id we generate and send to PayWay's generate-qr API. Kept
  separate from the existing free-text `transaction_id` column (which
  is the user's own manual claim for the old manual-proof flow).
- `subscription_requests.qr_expires_at` (timestamptz, nullable): when the
  generated KHQR code stops being scannable, so the frontend/polling can
  stop early.
- `profiles.subscription_expires_at` (timestamptz, nullable): the date
  the user's paid access runs out. NULL means "no active paid period"
  (trial or locked).

3. Automation
- `apply_subscription_on_confirm()` trigger function: fires whenever a
  `subscription_requests` row's status changes to 'confirmed'. It looks
  up how many months the plan is worth, extends
  `profiles.subscription_expires_at` from `greatest(now(), current
  expiry)`, and sets `profiles.is_locked = false`.
- This runs with SECURITY DEFINER (elevated access) so it works no
  matter which caller (Edge Function using the service role, or an
  admin manually editing the row in Supabase Table Editor) flips the
  status - the unlock logic only lives in one place.

## Important Notes
- Safe to re-run (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE).
- This does NOT re-lock accounts when `subscription_expires_at` passes;
  that is a separate concern (e.g. a scheduled Edge Function) and is
  intentionally left out of this migration.
*/

ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS payway_tran_id text UNIQUE;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS qr_expires_at timestamptz;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

CREATE OR REPLACE FUNCTION apply_subscription_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  plan_months integer;
  current_expiry timestamptz;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    plan_months := CASE NEW.plan
      WHEN '1m' THEN 1
      WHEN '6m' THEN 6
      WHEN '1y' THEN 12
      ELSE 1
    END;

    SELECT subscription_expires_at INTO current_expiry FROM profiles WHERE id = NEW.user_id;

    UPDATE profiles
    SET is_locked = false,
        subscription_expires_at = GREATEST(now(), COALESCE(current_expiry, now())) + (plan_months || ' months')::interval
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_subscription_on_confirm ON subscription_requests;
CREATE TRIGGER trg_apply_subscription_on_confirm
  AFTER UPDATE ON subscription_requests
  FOR EACH ROW
  EXECUTE FUNCTION apply_subscription_on_confirm();
