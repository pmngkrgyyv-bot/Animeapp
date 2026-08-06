/*
# Add payment verification fields to subscription_requests

1. Modified Tables
- `subscription_requests`: add `transaction_id` (text, nullable) and
  `payment_date` (date, nullable) so the admin can match a submitted
  request against the actual ABA KHQR transaction (the QR's transaction ID
  differs every time a customer pays, even though the payee name stays the
  same). Also add `proof_url` (text, nullable) for an optional screenshot
  of the payment receipt.

## Important Notes
- Safe to re-run (ADD COLUMN IF NOT EXISTS).
*/

ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS proof_url text;
