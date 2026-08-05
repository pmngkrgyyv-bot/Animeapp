require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('./supabase');
const { linkAccount, canWatchEpisode, getPlaybackUrl } = require('./vip');

if (!process.env.BOT_TOKEN) {
  throw new Error('សូមកំណត់ BOT_TOKEN ក្នុងឯកសារ .env');
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const SUBSCRIBE_URL = process.env.APP_SUBSCRIBE_URL || 'https://example.com/subscribe';

// ============ /start ============
bot.start((ctx) => {
  return ctx.reply(
    'សូមស្វាគមន៍មកកាន់ Nint Anime Bot 🎬\nជ្រើសរើសខាងក្រោមដើម្បីចាប់ផ្តើម៖',
    Markup.inlineKeyboard([
      [Markup.button.callback('🔍 ស្វែងរករឿង', 'search_prompt')],
      [Markup.button.callback('📂 ប្រភេទ', 'categories')],
      [Markup.button.callback('🆕 ចេញថ្មី', 'new_releases')],
      [Markup.button.callback('🆓 មើលឥតគិតថ្លៃ', 'free_shows')],
    ])
  );
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
  return ctx.reply(`បានរកឃើញ ${shows.length} លទ្ធផល៖`, Markup.inlineKeyboard(buttons));
});

// ============ ប្រភេទ (genres) ============
bot.action('categories', async (ctx) => {
  await ctx.answerCbQuery();
  const { data: genres, error } = await supabase.from('genres').select('id, name');

  if (error || !genres || genres.length === 0) {
    return ctx.reply('មិនទាន់មានប្រភេទត្រូវបានកំណត់ទេ។');
  }

  const buttons = genres.map((g) => [Markup.button.callback(g.name, `genre_${g.id}`)]);
  return ctx.reply('ជ្រើសរើសប្រភេទ៖', Markup.inlineKeyboard(buttons));
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
  return ctx.reply('រឿងក្នុងប្រភេទនេះ៖', Markup.inlineKeyboard(buttons));
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
  return ctx.reply('រឿងចេញថ្មីៗ៖', Markup.inlineKeyboard(buttons));
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
  return ctx.reply('រឿងឥតគិតថ្លៃ 🆓', Markup.inlineKeyboard(buttons));
});

// ============ បង្ហាញវគ្គនៃរឿងមួយ ============
bot.action(/^show_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const showId = ctx.match[1];

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
  return ctx.reply('ជ្រើសរើសវគ្គ៖', Markup.inlineKeyboard(buttons));
});

// ============ ពិនិត្យសិទ្ធិ + ផ្ញើលីងចាក់វីដេអូ ============
bot.action(/^ep_([^_]+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, episodeId, showId] = ctx.match;

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
      Markup.inlineKeyboard([Markup.button.url('💎 ជាវឥឡូវនេះ', SUBSCRIBE_URL)])
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
  return ctx.reply(`🎬 វគ្គទី ${episode.episode_number} — ${episode.title}\n${playback.url}${expiryNote}`);
});

bot.launch();
console.log('Nint Anime Bot កំពុងដំណើរការ...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
