const { Markup } = require('telegraf');
const supabase = require('./supabase');

/**
 * ជ្រើសរឿងចៃដន្យមួយសម្រាប់ផុសផ្សព្វផ្សាយ
 * ចាប់អារម្មណ៍លើ shows.featured = true មុន បើមិនមាន ចាប់ចៃដន្យ
 */
async function pickPromoShow() {
  let { data: shows } = await supabase
    .from('shows')
    .select('id, title, synopsis, poster_url, banner_url')
    .eq('featured', true)
    .limit(20);

  if (!shows || shows.length === 0) {
    const { data: anyShows } = await supabase
      .from('shows')
      .select('id, title, synopsis, poster_url, banner_url')
      .limit(30);
    shows = anyShows || [];
  }

  if (shows.length === 0) return null;
  return shows[Math.floor(Math.random() * shows.length)];
}

// អត្ថបទផ្សព្វផ្សាយច្រើនបែប — Bot នឹងជ្រើសរើសចៃដន្យម្តងៗ ដើម្បីកុំឲ្យសារដដែលរាល់ដង
const PROMO_HEADLINES = [
  '🔥 កំពុងពេញនិយមឥឡូវនេះ!',
  '✨ កុំខកខានមើលរឿងនេះ!',
  '🎬 រកមើលបានហើយក្នុង App!',
  '🌟 រឿងណែនាំសម្រាប់ថ្ងៃនេះ!',
];

/**
 * បង្កើត + ផុសសារផ្សព្វផ្សាយមួយទៅ Group/Channel
 * ប្រើ banner_url (ធំទូលាយ ដូច card) មុន បើគ្មានប្រើ poster_url ជំនួស
 */
async function postPromo(bot, targetChatId, appUrl, botUsername) {
  if (!targetChatId) return { ok: false, reason: 'no_target' };

  const show = await pickPromoShow();
  const headline = PROMO_HEADLINES[Math.floor(Math.random() * PROMO_HEADLINES.length)];

  const caption = show
    ? `${headline}\n\n🎬 <b>${show.title}</b>\n${(show.synopsis || '').slice(0, 200)}\n━━━━━━━━━━━━━━━\n📲 ចូលមើលឥឡូវនេះក្នុង App Nint Anime!`
    : `${headline}\n\n📲 ចូលមើលអានីមេគ្រប់ប្រភេទក្នុង App Nint Anime — ថ្មីរាល់ថ្ងៃ!`;

  const buttons = [
    [Markup.button.url('🌐 ចូល App ឥឡូវនេះ', appUrl)],
  ];
  if (show && botUsername) {
    buttons.unshift([
      Markup.button.url('▶️ មើលរឿងនេះ', `https://t.me/${botUsername}?start=show_${show.id}`),
    ]);
  }

  const displayImage = show?.banner_url || show?.poster_url;

  try {
    if (displayImage) {
      await bot.telegram.sendPhoto(targetChatId, displayImage, {
        caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons),
      });
    } else {
      await bot.telegram.sendMessage(targetChatId, caption, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons),
      });
    }
    return { ok: true };
  } catch (err) {
    console.error('ផុសផ្សព្វផ្សាយមិនជោគជ័យ:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { postPromo, pickPromoShow };
