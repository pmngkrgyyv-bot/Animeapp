/*
# NINT ANIME — Simplify payments to Telegram-only auto-confirm

1. Purpose
   The subscription flow no longer has a manual/OCR review path at all —
   every request is either auto-confirmed by the telegram-webhook edge
   function (matching the request's unique `match_code` against the ABA
   notification text) or it just stays 'pending' until it is. There is
   no more amount-based matching and no more auto-flip to 'failed' on a
   mismatch — see telegram-webhook/index.ts for the up-to-date matching
   logic.

   This migration removes the now-dead OCR/manual-review database
   functions so there's no leftover code path that could accidentally
   confirm (or block) a subscription outside the Telegram flow.

2. Drop dead functions
   - confirm_subscription_via_ocr(...) — was only ever called from
     src/lib/receiptOcr.ts, which nothing imports. Dropping every
     overload that was ever created for it.
   - expire_my_pending_subscription_request(uuid) — powered the old
     1-hour manual-review countdown; the app now uses a client-side
     3-minute timer only and doesn't call this.

3. Integrity check on insert (NOT a review step)
   `subscription_requests` used to trust whatever `amount` the client
   sent alongside `plan` on insert. Since nothing double-checks the
   amount at confirm time anymore (by design — see above), this adds a
   BEFORE INSERT trigger that forces `amount` to the fixed price for
   the chosen `plan`, no matter what the client sent. This is a plain
   data-integrity rule (same idea as a NOT NULL constraint), not a
   verification/approval step — it runs instantly on insert and never
   holds a row back or requires anyone to look at it.
*/

DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text);
DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text);
DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text, text);

DROP FUNCTION IF EXISTS expire_my_pending_subscription_request(uuid);

CREATE OR REPLACE FUNCTION enforce_subscription_request_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.amount := CASE NEW.plan
    WHEN '1m' THEN 2
    WHEN '2m' THEN 4
    WHEN '6m' THEN 7
    WHEN '1y' THEN 28
    ELSE NEW.amount
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_subscription_request_amount ON subscription_requests;
CREATE TRIGGER trg_enforce_subscription_request_amount
  BEFORE INSERT ON subscription_requests
  FOR EACH ROW
  EXECUTE FUNCTION enforce_subscription_request_amount();
