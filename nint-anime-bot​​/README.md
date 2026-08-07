# Nint Anime Telegram Bot

## ជំហានដំឡើង

1. **បង្កើត Bot Token**
   - បើក Telegram, ស្វែងរក `@BotFather`
   - វាយ `/newbot` ធ្វើតាមការណែនាំ (ដាក់ឈ្មោះ + username)
   - ចម្លង Token ដែលបានមក

2. **ដំឡើង Dependencies**
   ```
   cd nint-anime-bot
   npm install
   ```

3. **កំណត់ Environment Variables**
   - ចម្លង `.env.example` ទៅ `.env`
   - បំពេញ `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APP_SUBSCRIBE_URL`
   - `SUPABASE_SERVICE_KEY` ត្រូវយកពី Supabase Dashboard > Project Settings > API > `service_role` key (មិនមែន anon key)

4. **រត់ SQL Schema**
   - បើក Supabase Dashboard > SQL Editor
   - Setup ថ្មី៖ ចម្លងខ្លឹមសារពី `schema-full.sql` (មានគ្រប់តារាង/column ចាំបាច់ទាំងអស់រួច) រួចរត់
   - បើធ្លាប់រត់ `schema.sql`/`schema-addition.sql`/`schema-full.sql` ចាស់រួចហើយ៖ រត់តែ `schema-addition-2.sql`
     បន្ថែម (បន្ថែម column `shows.posted_to_channel` សម្រាប់មុខងារផុសរឿងថ្មីទៅ Channel)

5. **ចាប់ផ្តើម Bot**
   ```
   npm start
   ```

## មុនប្រើប្រាស់ពិត សូមកែតម្រូវ

កូដនេះសន្មតឈ្មោះតារាង/column ដូចខាងក្រោម សូមប្រៀបធៀបនឹង database ជាក់ស្តែងរបស់អ្នក ហើយកែក្នុង `src/bot.js` និង `src/vip.js` បើខុសគ្នា៖

| តារាង | Column សំខាន់ៗ |
|---|---|
| shows | id, title, poster_url, category_id, created_at |
| episodes | id, show_id, episode_number, is_locked, video_url |
| categories | id, name |
| subscriptions | app_user_id, end_date, status |
| link_codes | code, app_user_id, used, expires_at (ថ្មី) |
| telegram_links | telegram_id, app_user_id (ថ្មី) |
| shows (បន្ថែម) | trailer_url, posted_to_channel (ថ្មី) |

## ផ្នែកនៅ App ដែលត្រូវបន្ថែម (ដើម្បីឲ្យប្រព័ន្ធភ្ជាប់គណនីដំណើរការ)

នៅក្នុង App Nint Anime ត្រូវមានប៊ូតុង "ភ្ជាប់ Telegram" ដែលពេលចុច នឹង៖
1. បង្កើតលេខកូដ 6ខ្ទង់ចៃដន្យ
2. រក្សាទុកក្នុងតារាង `link_codes` ជាមួយ `app_user_id` របស់អ្នកប្រើបច្ចុប្បន្ន និង `expires_at` = ឥឡូវ + 5នាទី
3. បង្ហាញកូដនោះលើអេក្រង់ ព្រមជាមួយសេចក្ដីណែនាំ "បើក Telegram Bot @YourBotName រួចវាយ /link [កូដ]"

## ការផុសទៅ Telegram Channel/Group

Bot អាចផុសខ្លឹមសារទៅ Channel/Group ស្វ័យប្រវត្តិបាន 2 ប្រភេទ។ **ទាំងពីរមិនដែលបង្ហាញព័ត៌មានវគ្គ
(episode) ឬលីងចាក់វីដេអូទៅ Channel ជាសាធារណៈជាដាច់ខាត** — ដើម្បីរក្សា VIP paywall ឲ្យរឹងមាំ
(ការគិតលុយសមាជិក VIP)៖

| ប្រភេទ | អ្វីដែលផុស | ចន្លោះពេល (.env) | Command ផុសភ្លាមៗ |
|---|---|---|---|
| 🆕 រឿងថ្មី | Poster/Trailer + ចំណងជើង + សេចក្ដីសង្ខេប នៃរឿងថ្មីនីមួយៗ (ផុសម្តងគត់ក្នុងមួយរឿង) | `POST_INTERVAL_MINUTES` → `CHANNEL_ID` | `/announce` (admin ប៉ុណ្ណោះ) |
| 📣 ផ្សព្វផ្សាយ | Poster/Trailer នៃរឿងចៃដន្យ (featured មុន) — អាចផុសរឿងតែមួយច្រើនដង | `PROMO_INTERVAL_HOURS` → `PROMO_TARGET_ID` (ឬ `CHANNEL_ID`) | `/promo` (admin ប៉ុណ្ណោះ) |

- បើរឿងណាមួយមាន `trailer_url` Bot ផ្ញើជា video ចាក់បានផ្ទាល់ក្នុង Telegram; បើគ្មាន ប្រើ `banner_url`
  រួច `poster_url` ជារូបភាពជំនួស។
- ប៊ូតុង "▶️ មើលរឿងនេះ" ក្នុងសារទាំងនេះនាំអ្នកចូល **Bot** (មិនចាក់ក្នុង Channel ផ្ទាល់ទេ) — Bot នឹង
  បង្ហាញបញ្ជីវគ្គ ហើយពិនិត្យសិទ្ធិ VIP ជានិច្ចមុននឹងផ្ញើលីងចាក់ (មើល `src/vip.js`)។
- ដើម្បីបិទការផុសប្រភេទណាមួយ គ្រាន់តែទុក `CHANNEL_ID` និង/ឬ `PROMO_TARGET_ID` ឲ្យទទេក្នុង `.env`។
- Admin commands ត្រូវការ `ADMIN_TELEGRAM_IDS` កំណត់ក្នុង `.env` សិន (លេខ Telegram ID របស់អ្នក)។

## Roadmap បន្ថែម (ជម្រើសសម្រាប់ពេលក្រោយ)

- បញ្ជូនវីដេអូជា Telegram file_id ជំនួសលីងផ្ទាល់ (ការពារការចែករំលែក)
- Admin commands សម្រាប់គ្រប់គ្រង show/episode ដោយផ្ទាល់ពី Telegram
- Webhook mode ជំនួស polling សម្រាប់ deploy លើ production
- Rate limiting ការពារ spam ស្វែងរក
