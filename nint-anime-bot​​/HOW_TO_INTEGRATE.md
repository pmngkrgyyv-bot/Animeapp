# របៀបភ្ជាប់ Bot ចូលទៅក្នុង Project ជាក់ស្តែងរបស់អ្នក

## ១. រត់ SQL (Supabase SQL Editor)
ចម្លងខ្លឹមសារទាំងអស់ពី `schema.sql` (ក្នុង folder នេះ) រួចរត់ក្នុង Supabase Dashboard → SQL Editor។
វានឹងបង្កើត៖
- តារាង `link_codes`, `telegram_links`
- Function `generate_telegram_link_code()`

## ២. ដាក់ Component ចូល App
1. ចម្លងឯកសារ `TelegramLinkCard.tsx` ទៅ `project/src/components/TelegramLinkCard.tsx`
2. បើក `project/src/components/ProfileScreen.tsx`
3. បន្ថែម import នៅខាងលើ៖
   ```tsx
   import TelegramLinkCard from '@/components/TelegramLinkCard';
   ```
4. រកជួរ `{/* Telegram support */}` (ប្រហែលបន្ទាត់ 422) ហើយដាក់ `<TelegramLinkCard />`
   នៅពីក្រោម block នោះ (មុន `{/* About us */}`):
   ```tsx
   {/* Telegram support */}
   <a href={TELEGRAM_SUPPORT_LINK} ...>
     ...
   </a>

   <TelegramLinkCard />   {/* <-- បន្ថែមជួរនេះ */}

   {/* About us */}
   ```
5. ក្នុង `TelegramLinkCard.tsx` ដាក់ username ពិតរបស់ bot អ្នកជំនួស `YOUR_BOT_USERNAME`

## ៣. ធ្វើ Bot Project ឲ្យរួចរាល់
ដូចរៀបរាប់ក្នុង README.md មេ៖ បង្កើត Bot Token ពី @BotFather, យក Supabase Service Role Key, `npm install`, `npm start`

## ៤. សាកល្បងលំហូរពេញលេញ
1. បើក App → Profile → ចុច "បង្កើតលេខកូដភ្ជាប់" → ឃើញកូដ 6 ខ្ទង់
2. បើក Telegram bot → វាយ `/link លេខកូដ`
3. ត្រឡប់ទៅ Bot → ស្វែងរករឿង → ជ្រើសវគ្គ VIP → គួរតែឃើញលីងចាក់ (បើគណនីនោះមាន subscription សកម្ម)

## ចំណាំសំខាន់
- Bot នេះ **ខុសគ្នាទាំងស្រុង** ពី `supabase/functions/telegram-webhook` ដែលមានស្រាប់ (នោះសម្រាប់ auto-confirm ការទូទាត់ ABA ក្នុងក្រុម Telegram)។ អ្នកអាចប្រើ Bot Token ដូចគ្នាសម្រាប់ទាំងពីរ ឬបង្កើត Bot ថ្មីដាច់ដោយឡែកក៏បាន — ជម្រើសទាំងពីរដំណើរការបានទាំងអស់។
- Bucket `videos` ជា private storage — bot ប្រើ Service Role Key ដើម្បីបង្កើត Signed URL ស្របតាមតក្កវិជ្ជាដូចគ្នានឹង `get-video-url` edge function ដែលមានស្រាប់ ដូច្នេះលក្ខខណ្ឌចូលមើល (subscription/is_free_preview/is_admin) ត្រូវគ្នាទាំងស្រុងរវាង App និង Bot។
