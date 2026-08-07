import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// =====================================================================
// Telegram webhook: auto-confirm subscriptions from ABA Merchant's
// payment-notification group.
//
// MATCHING RULES, tried in order:
//   1. CODE MATCH — the notification text contains the exact 6-char
//      `match_code` for a pending request. This is unambiguous by
//      construction (match_code is globally unique), so it always wins
//      when present.
//   2. AMOUNT FALLBACK — ABA's merchant notification for a KHQR "scan to
//      pay" transfer does NOT carry a note/reference field through, so
//      match_code almost never actually appears in real notifications.
//      Since every plan has a distinct, fixed price ($2 / $4 / $7 / $28),
//      we can still safely auto-confirm on amount ALONE, but only when
//      it is unambiguous: exactly one 'pending' request for that amount
//      exists, created within the last AMOUNT_MATCH_WINDOW_MIN minutes.
//      If two or more pending requests share the same amount in that
//      window, we refuse to guess — both stay 'pending' until one of
//      them ages out or an admin resolves it manually. This mirrors why
//      amount-only matching was removed before: it's safe as long as we
//      fail closed on ambiguity instead of picking one.
//
// SETUP (do this once):
//   1. Create/reuse a bot via @BotFather, get its token.
//   2. In BotFather: /setprivacy -> Disable for this bot, so it can
//      read every message in a group, not just @mentions/commands.
//   3. Add the bot to the same Telegram group ABA Merchant posts
//      payment notifications into.
//   4. Register the webhook (run once from your machine or Postman):
//        curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//          -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
//          -d "secret_token=<A LONG RANDOM STRING YOU PICK>"
//   5. Set these Supabase Edge Function secrets:
//        TELEGRAM_WEBHOOK_SECRET   = the same secret_token from step 4
//        TELEGRAM_GROUP_ID         = the group's chat id
//        ABA_NOTIFIER_ID           = the sender id of ABA's bot
//        TELEGRAM_BOT_TOKEN        = optional, for in-group replies
// =====================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Bot-Api-Secret-Token",
};

// A match_code is 6 uppercase letters/digits (see generate_match_code()
// in the DB). Word-boundary so it doesn't grab a substring of a longer
// alphanumeric token in the notification.
const CODE_PATTERN = /\b([A-Z0-9]{6})\b/g;

function extractCandidateCodes(text: string): string[] {
  const upper = text.toUpperCase();
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  CODE_PATTERN.lastIndex = 0;
  while ((m = CODE_PATTERN.exec(upper)) !== null) {
    codes.add(m[1]);
  }
  return [...codes];
}

// Only these exact prices are ever valid plan prices — keep in sync with
// PLANS in src/components/SubscriptionModal.tsx and the
// enforce_subscription_request_amount() DB trigger.
const VALID_PLAN_AMOUNTS = new Set([2, 4, 7, 28]);

// A pending request is only eligible for amount-fallback matching while
// it's this fresh. Keeps an old abandoned 'pending' row from grabbing a
// much later, unrelated payment of the same amount. The in-app QR modal
// itself already expires/cancels a request after 3 minutes, so this only
// needs to cover network delay / a slow payer, not act as the real timer.
const AMOUNT_MATCH_WINDOW_MIN = 15;

// The recipient name ABA prints on every notification for this merchant.
// Requiring it means a stray/unrelated message in the group (or a
// notification for a *different* merchant account, if the group is ever
// reused) can never be mistaken for a payment to us.
const REQUIRED_MERCHANT_PHRASE = "PANG SOK HENG";

// Matches "$2.00", "2.00$", "USD2.00", "2.00 USD" etc. and captures the
// numeric amount. ABA's notification format leads with "$X.XX" so this
// covers the real case; the extra alternatives are defensive.
const AMOUNT_PATTERN = /(?:\$|USD)\s*([0-9]+(?:\.[0-9]{1,2})?)|([0-9]+(?:\.[0-9]{1,2})?)\s*(?:\$|USD)/i;

function extractAmount(text: string): number | null {
  const m = AMOUNT_PATTERN.exec(text);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  const value = Math.round(parseFloat(raw) * 100) / 100;
  return Number.isFinite(value) ? value : null;
}

async function replyToGroup(token: string, chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_notification: true,
        parse_mode: "HTML",
      }),
    });
  } catch {
    // Best-effort only — never let a reply failure affect confirmation.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Always ack Telegram quickly with 200, even on internal problems,
  // so it doesn't sit there retrying the same update forever.
  const ack = () => new Response("ok", { status: 200, headers: corsHeaders });

  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const groupId = Deno.env.get("TELEGRAM_GROUP_ID");
  const notifierId = Deno.env.get("ABA_NOTIFIER_ID");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (webhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== webhookSecret) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ack();
  }

  console.log("telegram-webhook update:", JSON.stringify(body));

  const message = body.message ?? body.channel_post;
  if (!message) return ack();

  const chatId: number | undefined = message.chat?.id;
  const fromId: number | undefined = message.from?.id ?? message.sender_chat?.id;
  const text: string = message.text ?? message.caption ?? "";

  if (!text) return ack();

  // Only trust messages from the configured group / sender once those
  // secrets are set. Until they are, we log-only (see setup note above).
  if (groupId && String(chatId) !== groupId) {
    console.log(`[FILTER] Chat ID mismatch: ${chatId} vs ${groupId}`);
    return ack();
  }
  if (notifierId && String(fromId) !== notifierId) {
    console.log(`[FILTER] Sender ID mismatch: ${fromId} vs ${notifierId}`);
    return ack();
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    let matchedId: string | null = null;
    let matchedVia = "";

    // --- 1. Try code match first (unambiguous when it hits) -----------
    const candidateCodes = extractCandidateCodes(text);
    console.log(`Extracted codes: ${candidateCodes.join(", ")}`);

    if (candidateCodes.length > 0) {
      const { data: rows, error: lookupError } = await adminClient
        .from("subscription_requests")
        .select("id, match_code")
        .eq("status", "pending")
        .in("match_code", candidateCodes);

      if (lookupError) {
        console.error("Code lookup error:", lookupError);
      } else if (rows && rows.length === 1) {
        matchedId = rows[0].id;
        matchedVia = "telegram_code";
        console.log(`[MATCHED:code] Request ID: ${matchedId}, code: ${rows[0].match_code}`);
      } else if (rows && rows.length > 1) {
        console.log(`[AMBIGUOUS:code] Multiple pending rows match codes: ${rows.map((r) => r.match_code).join(", ")}`);
      }
    }

    // --- 2. Fall back to amount match if no code matched ---------------
    // Real ABA merchant notifications for a static "scan to pay" KHQR
    // don't carry the note field through, so this is the common path in
    // practice, not a rare fallback.
    if (!matchedId) {
      if (!text.toUpperCase().includes(REQUIRED_MERCHANT_PHRASE)) {
        console.log("[NO_MATCH] Merchant phrase not found; skipping amount fallback.");
        return ack();
      }

      const amount = extractAmount(text);
      console.log(`Extracted amount: ${amount}`);

      if (amount === null || !VALID_PLAN_AMOUNTS.has(amount)) {
        console.log(`[NO_MATCH] No usable amount (or not a known plan price) in: "${text}"`);
        return ack();
      }

      const sinceIso = new Date(Date.now() - AMOUNT_MATCH_WINDOW_MIN * 60_000).toISOString();

      const { data: rows, error: lookupError } = await adminClient
        .from("subscription_requests")
        .select("id, amount, created_at")
        .eq("status", "pending")
        .eq("amount", amount)
        .gte("created_at", sinceIso);

      if (lookupError) {
        console.error("Amount lookup error:", lookupError);
        return ack();
      }

      if (!rows || rows.length === 0) {
        console.log(`[NO_MATCH] No pending request for amount $${amount} in the last ${AMOUNT_MATCH_WINDOW_MIN}min.`);
        return ack();
      }

      if (rows.length > 1) {
        // More than one pending request at this exact price right now —
        // refuse to guess which payer this notification belongs to.
        // They'll need to wait for a match_code hit or an admin to
        // resolve it manually.
        console.log(`[AMBIGUOUS:amount] ${rows.length} pending requests for amount $${amount}: ${rows.map((r) => r.id).join(", ")}`);
        return ack();
      }

      matchedId = rows[0].id;
      matchedVia = "telegram_amount";
      console.log(`[MATCHED:amount] Request ID: ${matchedId}, amount: $${amount}`);
    }

    const { data: updated, error } = await adminClient
      .from("subscription_requests")
      .update({ status: "confirmed", verified_method: matchedVia })
      .eq("id", matchedId)
      .eq("status", "pending") // guard against a race with another confirmation
      .select("id, user_id, plan")
      .maybeSingle();

    if (error) {
      console.error("Update error:", error);
      return ack();
    }

    if (updated) {
      console.log(`[SUCCESS] Confirmed request: ${updated.id} (plan: ${updated.plan}, via: ${matchedVia})`);

      if (botToken && chatId) {
        await replyToGroup(
          botToken,
          chatId,
          `✅ <b>${updated.plan.toUpperCase()}</b> subscription confirmed automatically.`,
        );
      }
    } else {
      console.log(`[RACE] Request ${matchedId} may have been confirmed by another process`);
    }

    return ack();
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return ack();
  }
});
