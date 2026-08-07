import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// =====================================================================
// Telegram webhook: auto-confirm subscriptions from ABA Merchant's
// payment-notification group.
//
// MATCHING RULE (single source of truth): a request is only ever
// confirmed when the notification text contains the exact 6-character
// `match_code` that was generated for that request. There is no
// amount-based fallback anymore — every KHQR the app shows already has
// the amount baked into the code (the payer's banking app won't let
// them change it), so the amount can never actually mismatch, and
// trying to "double check" it only caused two problems in practice:
//   1. Two people paying the same plan around the same time made the
//      amount ambiguous, so their payment got wrongly flagged 'failed'.
//   2. It gave a second way for a request to get stuck, instead of
//      just... matching the code and unlocking.
// match_code is globally unique (DB constraint), so code-only matching
// can never be ambiguous between concurrent requests.
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

  const candidateCodes = extractCandidateCodes(text);
  console.log(`Extracted codes: ${candidateCodes.join(", ")}`);

  if (candidateCodes.length === 0) {
    console.log("[NO_MATCH] No match_code found in notification text.");
    return ack();
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: rows, error: lookupError } = await adminClient
      .from("subscription_requests")
      .select("id, match_code")
      .eq("status", "pending")
      .in("match_code", candidateCodes);

    if (lookupError) {
      console.error("Lookup error:", lookupError);
      return ack();
    }

    if (!rows || rows.length === 0) {
      console.log(`[NO_MATCH] No pending request for codes: [${candidateCodes.join(", ")}]`);
      return ack();
    }

    // match_code is unique per row, so this can only happen if the
    // notification text happened to contain more than one valid-looking
    // 6-char token and more than one of them is a live pending request
    // (extremely unlikely, but we refuse rather than guess).
    if (rows.length > 1) {
      console.log(`[AMBIGUOUS] Multiple pending rows match codes: ${rows.map((r) => r.match_code).join(", ")}`);
      return ack();
    }

    const matchedId = rows[0].id;
    console.log(`[MATCHED] Request ID: ${matchedId}, code: ${rows[0].match_code}`);

    const { data: updated, error } = await adminClient
      .from("subscription_requests")
      .update({ status: "confirmed", verified_method: "telegram_auto" })
      .eq("id", matchedId)
      .eq("status", "pending") // guard against a race with another confirmation
      .select("id, user_id, plan")
      .maybeSingle();

    if (error) {
      console.error("Update error:", error);
      return ack();
    }

    if (updated) {
      console.log(`[SUCCESS] Confirmed request: ${updated.id} (plan: ${updated.plan})`);

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
