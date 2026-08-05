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
   - ចម្លងខ្លឹមសារពី `schema.sql` រួចរត់

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

## ផ្នែកនៅ App ដែលត្រូវបន្ថែម (ដើម្បីឲ្យប្រព័ន្ធភ្ជាប់គណនីដំណើរការ)

នៅក្នុង App Nint Anime ត្រូវមានប៊ូតុង "ភ្ជាប់ Telegram" ដែលពេលចុច នឹង៖
1. បង្កើតលេខកូដ 6ខ្ទង់ចៃដន្យ
2. រក្សាទុកក្នុងតារាង `link_codes` ជាមួយ `app_user_id` របស់អ្នកប្រើបច្ចុប្បន្ន និង `expires_at` = ឥឡូវ + 5នាទី
3. បង្ហាញកូដនោះលើអេក្រង់ ព្រមជាមួយសេចក្ដីណែនាំ "បើក Telegram Bot @YourBotName រួចវាយ /link [កូដ]"

## Roadmap បន្ថែម (ជម្រើសសម្រាប់ពេលក្រោយ)

- បញ្ជូនវីដេអូជា Telegram file_id ជំនួសលីងផ្ទាល់ (ការពារការចែករំលែក)
- Admin commands សម្រាប់គ្រប់គ្រង show/episode ដោយផ្ទាល់ពី Telegram
- Webhook mode ជំនួស polling សម្រាប់ deploy លើ production
- Rate limiting ការពារ spam ស្វែងរក
