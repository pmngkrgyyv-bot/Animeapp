-- ត្រូវរត់ក្នុង Supabase SQL Editor (បន្ថែមលើ schema.sql + schema-addition.sql + schema-full.sql ដែលរត់រួចហើយ)
--
-- ចំណាំ: Bot ត្រូវបានកែប្រែឲ្យផុសទៅ Channel ជា "រឿងថ្មី" (show) ជំនួសការផុសជា "វគ្គថ្មី" (episode)
-- ដូច្នេះត្រូវការ column តាមដានលើតារាង shows ជំនួសតារាង episodes

-- 6. Column សម្រាប់តាមដានថាតើ "រឿង" (show) មួយបានផុសប្រកាស "🆕 រឿងថ្មី" ទៅ Channel ហើយឬនៅ
alter table shows add column if not exists posted_to_channel boolean not null default false;

-- ចំណាំ: column ចាស់ `episodes.posted_to_channel` (បន្ថែមក្នុង schema-addition.sql) លែងប្រើដោយ Bot
-- ទៀតហើយ ព្រោះ Bot លែងផុសព័ត៌មានវគ្គទៅ Channel ទាល់តែសោះ (ដើម្បីរក្សា VIP paywall)។
-- អាចទុកវាចោលក៏បាន (មិនប៉ះពាល់អ្វី) ឬលុបចោលក៏បាន ប្រសិនបើចង់សម្អាត schema:
--   alter table episodes drop column if exists posted_to_channel;
