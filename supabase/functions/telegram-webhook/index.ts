import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// =====================================================================
// Telegram webhook: auto-confirm subscriptions from ABA Merchant's
// payment-notification group.
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

// Matches "$2.00", "USD 2", "2.00$", "7$", "$0.01", etc.
// More flexible: optional $ or USD before/after the number
const AMOUNT_PATTERN = /\$?\s*(\d+(?:\.\d{1,2})?)\s*\$?|USD\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*USD/gi;

// A match_code is 6 uppercase letters/digits (see generate_match_code()).
const CODE_PATTERN = /\b([A-Z0-9]{6})\b/g;

/**
 * Extract all numerical amounts from text and return them sorted.
 * Filters out amounts that are clearly not subscription prices (< 0.50 or > 100).
 */
function extractAmounts(text: string): number[] {
  const amounts = new Set<number>();
  let m: RegExpExecArray | null;
  
  AMOUNT_PATTERN.lastIndex = 0;
  while ((m = AMOUNT_PATTERN.exec(text)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3];
    if (!raw) continue;
    
    const n = parseFloat(raw);
    // Filter out unrealistic amounts for subscription: keep 0.5 - 100
    if (Number.isFinite(n) && n >= 0.5 && n <= 100) {
      amounts.add(n);
    }
  }
  
  return Array.from(amounts).sort((a, b) => a - b);
}

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
        parse_mode: "HTML"
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

  const amounts = extractAmounts(text);
  const candidateCodes = extractCandidateCodes(text);

  console.log(`Extracted amounts: ${amounts.join(", ")}`);
  console.log(`Extracted codes: ${candidateCodes.join(", ")}`);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    let matchedId: string | null = null;
    let matchReason = "";

    // Primary signal: a unique match_code found in the notification text.
    if (candidateCodes.length > 0) {
      const { data: rows } = await adminClient
        .from("subscription_requests")
        .select("id, match_code, amount")
        .eq("status", "pending")
        .in("match_code", candidateCodes);

      if (rows && rows.length === 1) {
        matchedId = rows[0].id;
        matchReason = `match_code: ${rows[0].match_code}`;
      } else if (rows && rows.length > 1) {
        console.log(`[AMBIGUOUS] Multiple rows match codes: ${rows.map(r => r.match_code).join(", ")}`);
      }
    }

    // Fallback: exact amount match among recent pending requests
    // Only if no code matched above.
    if (!matchedId && amounts.length > 0) {
      const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      
      // Try each extracted amount, in order of specificity
      for (const amount of amounts) {
        const { data: rows } = await adminClient
          .from("subscription_requests")
          .select("id, amount, created_at")
          .eq("status", "pending")
          .eq("amount", amount)
          .gte("created_at", since);

        if (rows && rows.length === 1) {
          matchedId = rows[0].id;
          matchReason = `amount: $${amount} (created at ${rows[0].created_at})`;
          break;
        } else if (rows && rows.length > 1) {
          console.log(`[AMBIGUOUS] Multiple rows match amount $${amount}: ${rows.length} rows`);
          // Continue to next amount
        }
      }
    }

    if (!matchedId) {
      // No exact-amount / code match. If there's exactly one pending
      // request outstanding right now, this notification is almost
      // certainly about it — just for a different amount (underpaid,
      // overpaid, or a stray notification). Flag it 'failed' so the app
      // (which is polling) can immediately tell the user to retry instead
      // of silently sitting on "pending" until the on-screen timer runs
      // out. This is a best-effort heuristic — with more than one
      // outstanding request we can't tell whose payment this was, so we
      // deliberately leave those alone.
      if (amounts.length > 0) {
        const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: pendingRows } = await adminClient
          .from("subscription_requests")
          .select("id, amount, created_at")
          .eq("status", "pending")
          .gte("created_at", since);

        if (pendingRows && pendingRows.length === 1) {
          const lone = pendingRows[0];
          console.log(
            `[MISMATCH] Notification amount(s) [${amounts.join(", ")}] don't match the ` +
            `lone pending request's amount ($${lone.amount}, id ${lone.id}) — marking failed.`
          );
          const { error: failError } = await adminClient
            .from("subscription_requests")
            .update({ status: "failed", verified_method: "telegram_amount_mismatch" })
            .eq("id", lone.id)
            .eq("status", "pending"); // guard against a race
          if (failError) console.error("Failed to flag amount mismatch:", failError);
        } else if (pendingRows && pendingRows.length > 1) {
          console.log(`[AMBIGUOUS] ${pendingRows.length} pending requests outstanding — can't tell which one this notification is about.`);
        }
      }

      console.log(
        `[NO_MATCH] Could not find unambiguous pending request to confirm. ` +
        `Codes: [${candidateCodes.join(", ")}], Amounts: [${amounts.join(", ")}]`
      );
      return ack();
    }

    console.log(`[MATCHED] Request ID: ${matchedId}, Reason: ${matchReason}`);

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
      
      // Optional: reply in the group if bot token is configured
      if (botToken && chatId) {
        await replyToGroup(
          botToken,
          chatId,
          `✅ <b>${updated.plan.toUpperCase()}</b> subscription confirmed automatically.`
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
