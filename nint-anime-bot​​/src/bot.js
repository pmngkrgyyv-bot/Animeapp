require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('./supabase');
const {
  linkAccount,
  canWatchEpisode,
  getPlaybackUrl,
  getLinkedAppUser,
  PLANS,
  createSubscriptionRequest,
} = require('./vip');
const { postPromo } = require('./promo');

if (!process.env.BOT_TOKEN) {
  throw new Error('សូមកំណត់ BOT_TOKEN ក្នុងឯកសារ .env');
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const SUBSCRIBE_URL = process.env.APP_SUBSCRIBE_URL || 'https://example.com/subscribe';
// លីង Web App សំខាន់ (Homepage) — ប្រើសម្រាប់ប៊ូតុង "បើក App"
const APP_URL = process.env.APP_URL || SUBSCRIBE_URL;
// Banner សម្រាប់សារ /start (ស្រេចចិត្ត — ទុកទទេបើមិនចង់ប្រើ)
const START_BANNER_URL = process.env.START_BANNER_URL || '';
// username របស់ bot ដោយគ្មាន @ (ប្រើសម្រាប់បង្កើត deep-link ពី Channel ចូល Bot)
const BOT_USERNAME = process.env.BOT_USERNAME || '';

// បង្ហាញម៉ឺនុយ Command ជាប់អចិន្ត្រៃយ៍ (ចុច "/" ក្នុង Telegram)
bot.telegram.setMyCommands([
  { command: 'start', description: '🏠 ទំព័រដើម' },
  { command: 'me', description: '👤 គណនីរបស់ខ្ញុំ' },
  { command: 'link', description: '🔗 ភ្ជាប់គណនី App' },
  { command: 'help', description: '❓ ជំនួយ' },
]);

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔍 ស្វែងរក', 'search_prompt'),
      Markup.button.callback('📂 ប្រភេទ', 'categories'),
    ],
    [
      Markup.button.callback('🆕 ចេញថ្មី', 'new_releases'),
      Markup.button.callback('⭐ ពេញនិយម', 'popular_shows'),
    ],
    [
      Markup.button.callback('🆓 ឥតគិតថ្លៃ', 'free_shows'),
      Markup.button.callback('👤 គណនីខ្ញុំ', 'my_account'),
    ],
    // Mini App: បើក Web App ដោយផ្ទាល់ក្នុង Telegram (មិនចេញ browser ក្រៅ)
    [Markup.button.webApp('🌐 បើក App ក្នុង Telegram', APP_URL)],
  ]);
}

// ============ /start ============
bot.start(async (ctx) => {
  // ករណីមកពី Deep Link ចុចពី Channel post (t.me/BotName?start=ep_xxx_yyy ឬ show_xxx)
  const payload = ctx.startPayload; // telegraf ដកចេញពាក្យ "start=" ឲ្យស្រាប់
  if (payload && payload.startsWith('ep_')) {
    const [, episodeId, showId] = payload.match(/^ep_([^_]+)_(.+)$/) || [];
    if (episodeId && showId) {
      return sendEpisodePlayback(ctx, episodeId, showId);
    }
  }
  if (payload && payload.startsWith('show_')) {
    const showId = payload.replace('show_', '');
    return sendShowDetail(ctx, showId);
  }

  const caption =
    '🎬 <b>Nint Anime Bot</b>\n' +
    '━━━━━━━━━━━━━━━\n' +
    'មើលអានីមេស្រណុកៗ ភ្ជាប់ជាមួយគណនី App របស់អ្នក\n\n' +
    'ជ្រើសរើសខាងក្រោមដើម្បីចាប់ផ្តើម 👇';
  const buttons = mainMenu();

  if (START_BANNER_URL) {
    return ctx.replyWithPhoto(START_BANNER_URL, {
      caption,
      parse_mode: 'HTML',
      ...buttons,
    });
  }
  return ctx.reply(caption, { parse_mode: 'HTML', ...buttons });
});

bot.help((ctx) =>
  ctx.reply(
    '❓ <b>របៀបប្រើ Bot</b>\n━━━━━━━━━━━━━━━\n' +
      '🔍 ស្វែងរក — វាយឈ្មោះរឿងផ្ទាល់ក៏បាន\n' +
      '📂 ប្រភេទ — រុករកតាមប្រភេទចូលចិត្ត\n' +
      '🔗 /link [កូដ] — ភ្ជាប់គណនី App ដើម្បីមើលវគ្គ VIP\n' +
      '👤 /me — ពិនិត្យស្ថានភាព VIP របស់អ្នក',
    { parse_mode: 'HTML' }
  )
);

// ============ គណនីរបស់ខ្ញុំ ============
async function showAccountStatus(ctx) {
  const { getLinkedAppUser, getProfile, isSubscriptionActive } = require('./vip');
  const appUserId = await getLinkedAppUser(String(ctx.from.id));

  if (!appUserId) {
    return ctx.reply(
      '👤 <b>គណនីរបស់ខ្ញុំ</b>\n━━━━━━━━━━━━━━━\n' +
        '❌ មិនទាន់ភ្ជាប់គណនី App ទេ\n\n' +
        'សូមចូល App → Profile → ភ្ជាប់ Telegram ដើម្បីទទួលបានលេខកូដ រួចវាយ /link [កូដ]',
      { parse_mode: 'HTML' }
    );
  }

  const profile = await getProfile(appUserId);
  const active = isSubscriptionActive(profile);
  const statusLine = profile?.is_admin
    ? '👑 Admin'
    : active
    ? `✅ VIP សកម្ម (ផុតកំណត់ ${new Date(profile.subscription_expires_at).toLocaleDateString('km-KH')})`
    : '🔒 មិនទាន់ជា VIP';

  return ctx.reply(
    `👤 <b>គណនីរបស់ខ្ញុំ</b>\n━━━━━━━━━━━━━━━\n✅ បានភ្ជាប់គណនី App\n${statusLine}`,
    {
      parse_mode: 'HTML',
      ...(active || profile?.is_admin
        ? {}
        : Markup.inlineKeyboard([Markup.button.callback('💎 ជាវឥឡូវនេះ', 'subscribe_plans')])),
    }
  );
}

bot.command('me', showAccountStatus);
bot.action('my_account', async (ctx) => {
  await ctx.answerCbQuery();
  return showAccountStatus(ctx);
});

// ============ ពេញនិយម (តម្រៀបតាម rating) ============
bot.action('popular_shows', async (ctx) => {
  await ctx.answerCbQuery();
  const { data: shows, error } = await supabase
    .from('shows')
    .select('id, title, rating')
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error || !shows || shows.length === 0) {
    return ctx.reply('មិនទាន់មានទិន្នន័យពេញនិយមទេ។');
  }

  const buttons = shows.map((s) => [
    Markup.button.callback(`⭐ ${s.rating ?? '-'}  ${s.title}`, `show_${s.id}`),
  ]);
  return ctx.reply('⭐ <b>រឿងពេញនិយម</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// ============ ភ្ជាប់គណនី ============
bot.command('link', async (ctx) => {
  const code = ctx.message.text.split(' ')[1];
  if (!code) {
    return ctx.reply('សូមវាយ: /link លេខកូដដែលបានពី App\nឧទាហរណ៍: /link 482913');
  }

  const result = await linkAccount(String(ctx.from.id), code);
  if (result.success) {
    return ctx.reply('✅ ភ្ជាប់គណនីជោគជ័យ! ឥឡូវអ្នកអាចមើលវគ្គ VIP បានហើយបើអ្នកបានជាវ។');
  }

  return ctx.reply('❌ លេខកូដមិនត្រឹមត្រូវ ឬផុតកំណត់ សូមចូល App ដើម្បីបង្កើតកូដថ្មី។');
});

// ============ ស្វែងរក ============
bot.action('search_prompt', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('សូមវាយឈ្មោះរឿងដែលអ្នកចង់រក ✍️');
});

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return next();

  const { data: shows, error } = await supabase
    .from('shows')
    .select('id, title')
    .ilike('title', `%${text}%`)
    .limit(10);

  if (error || !shows || shows.length === 0) {
    return ctx.reply('រកមិនឃើញរឿងដែលត្រូវនឹងពាក្យនេះទេ 😔');
  }

  const buttons = shows.map((s) => [Markup.button.callback(s.title, `show_${s.id}`)]);
  return ctx.reply(`🔍 <b>លទ្ធផល</b> (${shows.length})`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// ============ ប្រភេទ (genres) ============
bot.action('categories', async (ctx) => {
  await ctx.answerCbQuery();
  const { data: genres, error } = await supabase.from('genres').select('id, name');

  if (error || !genres || genres.length === 0) {
    return ctx.reply('មិនទាន់មានប្រភេទត្រូវបានកំណត់ទេ។');
  }

  const buttons = genres.map((g) => [Markup.button.callback(g.name, `genre_${g.id}`)]);
  return ctx.reply('📂 <b>ជ្រើសរើសប្រភេទ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/^genre_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const genreId = ctx.match[1];

  // shows ភ្ជាប់ទៅ genre តាមរយៈតារាង show_genres (many-to-many)
  const { data: rows, error } = await supabase
    .from('show_genres')
    .select('show_id, shows(id, title)')
    .eq('genre_id', genreId)
    .limit(15);

  if (error || !rows || rows.length === 0) {
    return ctx.reply('មិនមានរឿងក្នុងប្រភេទនេះទេ។');
  }

  const buttons = rows
    .filter((r) => r.shows)
    .map((r) => [Markup.button.callback(r.shows.title, `show_${r.shows.id}`)]);
  return ctx.reply('📂 <b>រឿងក្នុងប្រភេទនេះ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// ============ ចេញថ្មី ============
bot.action('new_releases', async (ctx) => {
  await ctx.answerCbQuery();
  const { data: shows, error } = await supabase
    .from('shows')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !shows || shows.length === 0) {
    return ctx.reply('មិនទាន់មានរឿងថ្មីទេ។');
  }

  const buttons = shows.map((s) => [Markup.button.callback(s.title, `show_${s.id}`)]);
  return ctx.reply('🆕 <b>ចេញថ្មីៗ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// ============ រឿងឥតគិតថ្លៃ (shows.is_free = true) ============
bot.action('free_shows', async (ctx) => {
  await ctx.answerCbQuery();
  const { data: shows, error } = await supabase
    .from('shows')
    .select('id, title')
    .eq('is_free', true)
    .limit(15);

  if (error || !shows || shows.length === 0) {
    return ctx.reply('មិនទាន់មានរឿងឥតគិតថ្លៃទេ។');
  }

  const buttons = shows.map((s) => [Markup.button.callback(s.title, `show_${s.id}`)]);
  return ctx.reply('🆓 <b>មើលឥតគិតថ្លៃ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

// ============ បង្ហាញ Poster + ព័ត៌មានរឿង + វគ្គ ============
async function sendShowDetail(ctx, showId) {
  const { data: show } = await supabase
    .from('shows')
    .select('title, synopsis, poster_url, banner_url, trailer_url, release_year, rating, studio, type')
    .eq('id', showId)
    .single();

  const { data: episodes, error } = await supabase
    .from('episodes')
    .select('id, episode_number, season, title, is_free_preview')
    .eq('show_id', showId)
    .order('season', { ascending: true })
    .order('episode_number', { ascending: true });

  if (error || !episodes || episodes.length === 0) {
    return ctx.reply('មិនទាន់មានវគ្គសម្រាប់រឿងនេះទេ។');
  }

  const buttons = episodes.map((e) => [
    Markup.button.callback(
      `${e.is_free_preview ? '▶️' : '🔒'} វគ្គទី ${e.episode_number} — ${e.title}`,
      `ep_${e.id}_${showId}`
    ),
  ]);

  // ផ្ញើ Trailer/Banner/Poster + ព័ត៌មានសង្ខេប មុននឹងផ្ញើបញ្ជីវគ្គ
  // អាទិភាព: Trailer video > Banner (ធំទូលាយ ដូច card) > Poster (បញ្ឈរ) ជាជម្រើសចុងក្រោយ
  const displayImage = show?.banner_url || show?.poster_url;
  if (show?.trailer_url || displayImage) {
    const infoLines = [
      `🎬 *${show.title}*`,
      [show.release_year, show.studio, show.type].filter(Boolean).join(' • '),
      show.rating ? `⭐ ${show.rating}` : null,
      show.synopsis ? `\n${show.synopsis}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const caption = infoLines.slice(0, 1024); // Telegram caption limit

    if (show.trailer_url) {
      await ctx.replyWithVideo(show.trailer_url, { caption, parse_mode: 'Markdown' });
    } else {
      await ctx.replyWithPhoto(displayImage, { caption, parse_mode: 'Markdown' });
    }
  }

  return ctx.reply('📺 <b>ជ្រើសរើសវគ្គ</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

bot.action(/^show_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return sendShowDetail(ctx, ctx.match[1]);
});

// ============ ពិនិត្យសិទ្ធិ + ផ្ញើលីងចាក់វីដេអូ ============
// ដាក់ជា function ដាច់ដោយឡែក ដើម្បីអាចហៅពី callback button
// ក៏ដូចជាពី deep-link (ចុចពី Channel post ចូល Bot ដោយផ្ទាល់)
async function sendEpisodePlayback(ctx, episodeId, showId) {
  const { data: episode, error: epError } = await supabase
    .from('episodes')
    .select('id, episode_number, title, video_url, is_free_preview')
    .eq('id', episodeId)
    .single();

  const { data: show, error: showError } = await supabase
    .from('shows')
    .select('is_free')
    .eq('id', showId)
    .single();

  if (epError || !episode) {
    return ctx.reply('រកមិនឃើញវគ្គនេះទេ។');
  }

  const check = await canWatchEpisode(String(ctx.from.id), episode, showError ? null : show);

  if (!check.allowed) {
    if (check.reason === 'not_linked') {
      return ctx.reply(
        'អ្នកមិនទាន់ភ្ជាប់គណនី App ទេ។\nសូមចូល App > Profile > ភ្ជាប់ Telegram ដើម្បីទទួលបានលេខកូដ រួចវាយ /link លេខកូដ។'
      );
    }
    return ctx.reply(
      '🔒 វគ្គនេះសម្រាប់តែសមាជិកដែលបានជាវប៉ុណ្ណោះ។',
      Markup.inlineKeyboard([Markup.button.callback('💎 ជាវឥឡូវនេះ', 'subscribe_plans')])
    );
  }

  if (!episode.video_url) {
    return ctx.reply('វគ្គនេះមិនទាន់មានវីដេអូ upload ទេ។');
  }

  const playback = await getPlaybackUrl(episode.video_url);
  if (!playback.url) {
    return ctx.reply('មានបញ្ហាបច្ចេកទេសក្នុងការទាញយកលីងវីដេអូ សូមសាកល្បងម្តងទៀត។');
  }

  const expiryNote = playback.signed ? '\n(លីងនេះនឹងផុតកំណត់ក្នុងរយៈពេល 4 ម៉ោង)' : '';
  return ctx.reply(
    `🎬 <b>វគ្គទី ${episode.episode_number} — ${episode.title}</b>\n━━━━━━━━━━━━━━━\n▶️ ${playback.url}${expiryNote}`,
    { parse_mode: 'HTML' }
  );
}

bot.action(/^ep_([^_]+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, episodeId, showId] = ctx.match;
  return sendEpisodePlayback(ctx, episodeId, showId);
});

// ============ ស្វ័យប្រវត្តិផុសវគ្គថ្មីទៅ Channel ============
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const POST_INTERVAL_MS = Number(process.env.POST_INTERVAL_MINUTES || 5) * 60 * 1000;

async function postNewEpisodesToChannel() {
  if (!CHANNEL_ID) return; // មិនបានកំណត់ Channel ទេ — រំលង

  const { data: episodes, error } = await supabase
    .from('episodes')
    .select('id, episode_number, title, is_free_preview, show_id, shows(title, poster_url, banner_url)')
    .eq('posted_to_channel', false)
    .order('created_at', { ascending: true })
    .limit(5); // ផុសម្តងបន្តិចម្តងៗ ដើម្បីកុំឲ្យ Channel ជន់លិចភ្លាមៗ

  if (error || !episodes || episodes.length === 0) return;

  for (const ep of episodes) {
    const show = ep.shows;
    const lockNote = ep.is_free_preview ? '🆓 មើលបានឥតគិតថ្លៃ' : '🔒 សម្រាប់សមាជិក VIP';
    const caption =
      `🎬 <b>${show?.title || ''}</b>\n` +
      `វគ្គទី ${ep.episode_number} — ${ep.title}\n` +
      `${lockNote}\n━━━━━━━━━━━━━━━`;

    const watchButton = Markup.inlineKeyboard([
      Markup.button.url('▶️ មើលឥឡូវនេះ', `https://t.me/${BOT_USERNAME}?start=ep_${ep.id}_${ep.show_id}`),
    ]);

    try {
      const channelImage = show?.banner_url || show?.poster_url;
      if (channelImage) {
        await bot.telegram.sendPhoto(CHANNEL_ID, channelImage, {
          caption,
          parse_mode: 'HTML',
          ...watchButton,
        });
      } else {
        await bot.telegram.sendMessage(CHANNEL_ID, caption, { parse_mode: 'HTML', ...watchButton });
      }
      await supabase.from('episodes').update({ posted_to_channel: true }).eq('id', ep.id);
    } catch (err) {
      console.error('ផុសទៅ Channel មិនជោគជ័យសម្រាប់វគ្គ', ep.id, err.message);
    }
  }
}

if (CHANNEL_ID) {
  setInterval(postNewEpisodesToChannel, POST_INTERVAL_MS);
  postNewEpisodesToChannel(); // ពិនិត្យម្តងភ្លាមៗពេល Bot ចាប់ផ្តើម
}

// ============ ផុសផ្សព្វផ្សាយ (Promo) ស្វ័យប្រវត្តិទៅ Group/Channel ============
// អាចខុសពី CHANNEL_ID ខាងលើ (ឧ. ចង់ post ទៅ Group ដាច់ដោយឡែក)
const PROMO_TARGET_ID = process.env.PROMO_TARGET_ID || CHANNEL_ID;
const PROMO_INTERVAL_MS = Number(process.env.PROMO_INTERVAL_HOURS || 6) * 60 * 60 * 1000;
// បញ្ជីលេខ Telegram ID របស់ admin ដែលមានសិទ្ធិប្រើ /promo (ញែកដោយសញ្ញា ,)
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

if (PROMO_TARGET_ID) {
  setInterval(() => postPromo(bot, PROMO_TARGET_ID, APP_URL, BOT_USERNAME), PROMO_INTERVAL_MS);
}

// Command សម្រាប់ admin ចង់ផុសផ្សព្វផ្សាយភ្លាមៗ (មិនរង់ចាំ interval)
bot.command('promo', async (ctx) => {
  if (!ADMIN_IDS.includes(String(ctx.from.id))) {
    return ctx.reply('❌ Command នេះសម្រាប់តែ admin ប៉ុណ្ណោះ។');
  }
  if (!PROMO_TARGET_ID) {
    return ctx.reply('⚠️ មិនទាន់កំណត់ PROMO_TARGET_ID ក្នុង .env ទេ។');
  }
  const result = await postPromo(bot, PROMO_TARGET_ID, APP_URL, BOT_USERNAME);
  return ctx.reply(result.ok ? '✅ បានផុសផ្សព្វផ្សាយរួច!' : `❌ បរាជ័យ: ${result.reason}`);
});

// ============ ជាវ VIP ដោយផ្ទាល់ក្នុង Bot (ABA — ដូចគ្នានឹង App) ============
bot.action('subscribe_plans', async (ctx) => {
  await ctx.answerCbQuery();

  const appUserId = await getLinkedAppUser(String(ctx.from.id));
  if (!appUserId) {
    return ctx.reply(
      'អ្នកមិនទាន់ភ្ជាប់គណនី App ទេ។\nសូមចូល App > Profile > ភ្ជាប់ Telegram ដើម្បីទទួលបានលេខកូដ រួចវាយ /link លេខកូដ។'
    );
  }

  const buttons = Object.entries(PLANS).map(([key, plan]) => [
    Markup.button.callback(plan.label, `plan_${key}`),
  ]);
  return ctx.reply('💎 <b>ជ្រើសរើសផែនការ VIP</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/^plan_(1m|2m|6m|1y)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planKey = ctx.match[1];

  const appUserId = await getLinkedAppUser(String(ctx.from.id));
  if (!appUserId) {
    return ctx.reply('អ្នកមិនទាន់ភ្ជាប់គណនី App ទេ។ សូមវាយ /link លេខកូដសិន។');
  }

  const result = await createSubscriptionRequest(appUserId, planKey, ctx.chat.id);
  if (!result.ok) {
    return ctx.reply('❌ មានបញ្ហា សូមសាកល្បងម្តងទៀត។ (' + (result.reason || '') + ')');
  }

  const qrUrl = `${APP_URL}/assets/images/subscription-${planKey}.png`;
  const caption =
    `💳 <b>ការទូទាត់ ($${result.amount})</b>\n━━━━━━━━━━━━━━━\n` +
    `១. ស្កេន QR ខាងលើដោយ ABA Mobile\n` +
    `២. <b>វាយកូដនេះក្នុងប្រអប់ Message/Note មុនបញ្ជាក់ការទូទាត់៖</b>\n` +
    `<code>${result.matchCode}</code>\n\n` +
    `៣. បន្ទាប់ពីទូទាត់រួច ប្រព័ន្ធនឹងបញ្ជាក់ស្វ័យប្រវត្តិ ហើយ Bot នឹងជូនដំណឹងអ្នកភ្លាមៗនៅទីនេះ`;

  return ctx.replyWithPhoto(qrUrl, { caption, parse_mode: 'HTML' });
});

// ត្រួតពិនិត្យ Subscription Request ដែលបញ្ជាក់រួច ហើយជូនដំណឹងអ្នកប្រើក្នុង Telegram
async function checkConfirmedSubscriptions() {
  const { data: rows, error } = await supabase
    .from('subscription_requests')
    .select('id, notify_chat_id, plan, status')
    .eq('status', 'confirmed')
    .eq('notified', false)
    .not('notify_chat_id', 'is', null)
    .limit(20);

  if (error || !rows || rows.length === 0) return;

  for (const row of rows) {
    try {
      await bot.telegram.sendMessage(
        row.notify_chat_id,
        '✅ <b>ការទូទាត់ជោគជ័យ!</b>\nគណនីរបស់អ្នកឥឡូវជា VIP ហើយ — សូមរីករាយនឹងការទស្សនា! 🎉',
        { parse_mode: 'HTML' }
      );
      await supabase.from('subscription_requests').update({ notified: true }).eq('id', row.id);
    } catch (err) {
      console.error('ជូនដំណឹងទូទាត់មិនជោគជ័យ:', err.message);
    }
  }
}
setInterval(checkConfirmedSubscriptions, 20 * 1000);

bot.launch();
console.log('Nint Anime Bot កំពុងដំណើរការ...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
