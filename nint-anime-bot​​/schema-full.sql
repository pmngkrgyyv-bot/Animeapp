-- តារាងថ្មីទាំង 2 នេះត្រូវបន្ថែមក្នុង Supabase project ដដែលនឹង App Nint Anime
-- (ប្រើ SQL Editor ក្នុង Supabase Dashboard ដើម្បីរត់)
--
-- ចំណាំ: នេះជាតារាងសម្រាប់ភ្ជាប់គណនី Telegram <-> App User ប៉ុណ្ណោះ
-- (មិនទាក់ទងអី​ទៅនឹង telegram_webhook function ដែលមានស្រាប់សម្រាប់ auto-confirm ABA payment ទេ
--  ពីរនេះជាមុខងារខុសគ្នាទាំងស្រុង)

-- 1. តារាងកូដភ្ជាប់គណនី (បង្កើតដោយ App, ប្រើដោយ Bot)
create table if not exists link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  app_user_id uuid not null references profiles(id) on delete cascade,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 2. តារាងភ្ជាប់ Telegram <-> App account
create table if not exists telegram_links (
  telegram_id text primary key,
  app_user_id uuid not null references profiles(id) on delete cascade,
  linked_at timestamptz not null default now()
);

-- RLS: តារាងទាំងពីរនេះមិនចាំបាច់បើក public read/write policy ទេ
-- ព្រោះ Bot ប្រើ SERVICE ROLE KEY (bypass RLS) ជានិច្ច។ គ្រាន់តែបើក RLS
-- ដើម្បីការពារកុំឲ្យ anon/authenticated client (App) សរសេរផ្ទាល់បាន៖
alter table link_codes enable row level security;
alter table telegram_links enable row level security;
-- មិនបង្កើត policy អ្វីទាំងអស់ = បិទទាំងស្រុងសម្រាប់ anon/authenticated,
-- ចូលបានតែសិទ្ធិ service_role (Bot) ប៉ុណ្ណោះ

-- ចំណាំ: App ត្រូវបង្កើត link_codes ដោយប្រើ RPC function (SECURITY DEFINER)
-- ឬ Edge Function ដែលដំណើរការក្រោមសិទ្ធិ service role ជំនួសឲ្យសរសេរផ្ទាល់ពី client
-- (ព្រោះ client (anon/authenticated) មិនមានសិទ្ធិសរសេរតារាងនេះទេ)

-- 3. RPC function ដែល App ហៅដើម្បីបង្កើតកូដភ្ជាប់សម្រាប់អ្នកប្រើបច្ចុប្បន្ន
create or replace function generate_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- បង្កើតកូដលេខ 6 ខ្ទង់ចៃដន្យ
  new_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into link_codes (code, app_user_id, expires_at)
  values (new_code, auth.uid(), now() + interval '5 minutes');

  return new_code;
end;
$$;

-- App ហៅដូចនេះ (JS/TS): const { data } = await supabase.rpc('generate_telegram_link_code')

-- 4. Column សម្រាប់តាមដានថាតើវគ្គមួយបានផុសទៅ Telegram Channel ហើយឬនៅ
-- (ត្រូវការសម្រាប់មុខងារ "ស្វ័យប្រវត្តិផុសវគ្គថ្មីទៅ Channel")
alter table episodes add column if not exists posted_to_channel boolean not null default false;

-- 5. Column ស្រេចចិត្ត សម្រាប់ដាក់ Trailer video (mp4 URL) — Bot នឹងផ្ញើវាជា
-- video ចាក់បានផ្ទាល់ក្នុង Telegram ជំនួសរូបភាព ប្រសិនបើមានតម្លៃ
alter table shows add column if not exists trailer_url text;

-- 6. Column សម្រាប់តាមដានថាតើ "រឿង" (show) មួយបានផុសប្រកាស "🆕 រឿងថ្មី" ទៅ Channel ហើយឬនៅ
-- (Bot ផុសទៅ Channel តាម show ជំនួសតាម episode — ដើម្បីមិនឲ្យព័ត៌មានវគ្គចេញទៅ Channel ជាសាធារណៈ
--  ហើយរក្សា VIP paywall ឲ្យរឹងមាំ; column `episodes.posted_to_channel` ខាងលើលែងប្រើទៀតហើយ)
alter table shows add column if not exists posted_to_channel boolean not null default false;
