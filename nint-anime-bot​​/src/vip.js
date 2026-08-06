const supabase = require('./supabase');

/**
 * ភ្ជាប់គណនី Telegram ជាមួយគណនី App តាមរយៈកូដដែល App បានបង្កើត
 * (តារាង link_codes ត្រូវបង្កើតបន្ថែម — សូមមើល schema.sql)
 */
async function linkAccount(telegramId, code) {
  const { data: linkCode, error } = await supabase
    .from('link_codes')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (error || !linkCode) {
    return { success: false, reason: 'invalid_or_expired' };
  }

  const { error: upsertError } = await supabase
    .from('telegram_links')
    .upsert({
      telegram_id: telegramId,
      app_user_id: linkCode.app_user_id,
      linked_at: new Date().toISOString(),
    });

  if (upsertError) {
    return { success: false, reason: 'db_error' };
  }

  await supabase.from('link_codes').update({ used: true }).eq('code', code);

  return { success: true, appUserId: linkCode.app_user_id };
}

async function getLinkedAppUser(telegramId) {
  const { data, error } = await supabase
    .from('telegram_links')
    .select('app_user_id')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !data) return null;
  return data.app_user_id;
}

/**
 * ពិនិត្យស្ថានភាព subscription ផ្ទាល់ពីតារាង profiles
 * (ដូចគ្នាបេះបិទនឹងតក្កវិជ្ជាក្នុង supabase/functions/get-video-url/index.ts
 *  ដើម្បីកុំឲ្យ bot និង app មិនត្រូវគ្នា)
 */
async function getProfile(appUserId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_expires_at, is_admin')
    .eq('id', appUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function isSubscriptionActive(profile) {
  if (!profile) return false;
  return (
    !!profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at).getTime() > Date.now()
  );
}

/**
 * តក្កវិជ្ជាចូលមើលវគ្គមួយ — ត្រូវនឹងលក្ខខណ្ឌដូចគ្នានឹង get-video-url edge function:
 * អនុញ្ញាតបើ (1) show.is_free ឬ (2) episode.is_free_preview ឬ
 * (3) admin ឬ (4) subscription_expires_at នៅមិនទាន់ផុតកំណត់
 */
async function canWatchEpisode(telegramId, episode, show) {
  if (show?.is_free || episode.is_free_preview) {
    return { allowed: true };
  }

  const appUserId = await getLinkedAppUser(telegramId);
  if (!appUserId) {
    return { allowed: false, reason: 'not_linked' };
  }

  const profile = await getProfile(appUserId);
  if (!profile) {
    return { allowed: false, reason: 'not_linked' };
  }

  if (profile.is_admin || isSubscriptionActive(profile)) {
    return { allowed: true, appUserId };
  }

  return { allowed: false, reason: 'not_vip' };
}

/**
 * បង្កើត Signed URL ដោយផ្ទាល់ (bot មាន service_role key រួចហើយ
 * ដូច្នេះមិនចាំបាច់ហៅ get-video-url edge function ដែលទាមទារ user JWT ទេ)
 */
async function getPlaybackUrl(videoUrlColumn) {
  // ប្រសិនបើ admin បិទភ្ជាប់ជា URL ខាងក្រៅ (CDN) ផ្ញើត្រង់ៗ
  if (/^https?:\/\//i.test(videoUrlColumn)) {
    return { url: videoUrlColumn, signed: false };
  }

  // បើមិនមែនទេ សន្មតជា path ក្នុង private "videos" storage bucket
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(videoUrlColumn, 4 * 60 * 60); // 4 ម៉ោង ដូច get-video-url

  if (error || !data) return { url: null, signed: false, error: error?.message };
  return { url: data.signedUrl, signed: true };
}

/**
 * ផែនការ VIP — ត្រូវនឹងតម្លៃដូចគ្នានឹង App (SubscriptionModal.tsx)
 */
const PLANS = {
  '1m': { months: 1, price: 2, label: '១ ខែ — $2' },
  '2m': { months: 2, price: 4, label: '២ ខែ — $4' },
  '6m': { months: 6, price: 7, label: '៦ ខែ — $7' },
  '1y': { months: 12, price: 28, label: '១២ ខែ — $28' },
};

/**
 * បង្កើត Subscription Request ដូចគ្នានឹងអ្វីដែល App ធ្វើ (doCreateRequest)
 * ត្រូវការ chatId ដើម្បីឲ្យ Bot ដឹងកន្លែងផ្ញើសារជូនដំណឹងពេលទូទាត់ត្រូវបានបញ្ជាក់
 */
async function createSubscriptionRequest(appUserId, planKey, chatId) {
  const plan = PLANS[planKey];
  if (!plan) return { ok: false, reason: 'invalid_plan' };

  const { data, error } = await supabase
    .from('subscription_requests')
    .insert({
      user_id: appUserId,
      plan: planKey,
      amount: plan.price,
      discount: 0,
      description: 'Awaiting Telegram Bot auto-confirm',
      notify_chat_id: String(chatId),
    })
    .select('id, match_code')
    .single();

  if (error || !data) return { ok: false, reason: error?.message };
  return { ok: true, id: data.id, matchCode: data.match_code, amount: plan.price };
}

module.exports = {
  linkAccount,
  getLinkedAppUser,
  getProfile,
  isSubscriptionActive,
  canWatchEpisode,
  getPlaybackUrl,
  PLANS,
  createSubscriptionRequest,
};
