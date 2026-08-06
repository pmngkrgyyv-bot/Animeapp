-- ============================================================
-- Anime Streaming App — Database Schema (Supabase / Postgres)
-- ============================================================

-- ---------- 1. GENRES ----------
create table genres (
  id            uuid primary key default gen_random_uuid(),
  name_en       text not null,          -- e.g. "Martial Arts"
  name_kh       text,                   -- e.g. "សិល្បៈបាញ់ចំបាំង"
  slug          text unique not null,
  created_at    timestamptz default now()
);

-- ---------- 2. SHOWS (the anime series themselves) ----------
create table shows (
  id                uuid primary key default gen_random_uuid(),
  title_en          text not null,
  title_kh          text,
  slug              text unique not null,
  description_en    text,
  description_kh    text,
  cover_image_url   text,               -- vertical poster (card thumbnail)
  banner_image_url  text,               -- wide hero banner image
  release_year      int,
  status            text not null default 'ongoing'
                       check (status in ('ongoing','completed')),
  total_episodes    int default 0,      -- planned total (nullable if unknown)
  rating            numeric(3,1) default 0,   -- e.g. 10.0
  is_vip            boolean default false,    -- premium-only show
  is_featured       boolean default false,    -- shown in home hero carousel
  view_count        bigint default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ---------- 3. SHOW <-> GENRE (many-to-many) ----------
create table show_genres (
  show_id   uuid references shows(id) on delete cascade,
  genre_id  uuid references genres(id) on delete cascade,
  primary key (show_id, genre_id)
);

-- ---------- 4. EPISODES ----------
create table episodes (
  id                uuid primary key default gen_random_uuid(),
  show_id           uuid not null references shows(id) on delete cascade,
  episode_number    int not null,
  title_en          text,
  title_kh          text,
  video_url         text not null,      -- Bunny Stream / CDN playback URL
  thumbnail_url     text,
  duration_seconds  int,
  is_vip            boolean default false,   -- lock this specific episode
  view_count        bigint default 0,
  published_at      timestamptz default now(),
  created_at        timestamptz default now(),
  unique (show_id, episode_number)
);

-- ---------- 5. PROFILES (extends Supabase auth.users) ----------
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  avatar_url      text,
  is_vip          boolean default false,
  vip_expires_at  timestamptz,
  created_at      timestamptz default now()
);

-- ---------- 6. MY LIST (favorites / watchlist) ----------
create table favorites (
  user_id     uuid references profiles(id) on delete cascade,
  show_id     uuid references shows(id) on delete cascade,
  added_at    timestamptz default now(),
  primary key (user_id, show_id)
);

-- ---------- 7. WATCH HISTORY / CONTINUE WATCHING ----------
create table watch_history (
  user_id           uuid references profiles(id) on delete cascade,
  episode_id        uuid references episodes(id) on delete cascade,
  progress_seconds  int default 0,
  completed         boolean default false,
  last_watched_at   timestamptz default now(),
  primary key (user_id, episode_id)
);

-- ---------- Helpful indexes ----------
create index idx_episodes_show_id on episodes(show_id);
create index idx_shows_featured on shows(is_featured) where is_featured = true;
create index idx_shows_status on shows(status);
create index idx_watch_history_user on watch_history(user_id);
