-- ============================================================
-- TITAN Book Reader — Supabase setup
-- Run this entire script in Supabase: Project → SQL Editor → New query → Run
-- ============================================================

-- 1. Books table — one row per book per user
create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  local_id text not null,
  name text not null,
  author text default 'Unknown',
  chapters jsonb not null,
  updated_at timestamptz default now(),
  unique(user_id, local_id)
);

-- 2. Highlights table — one row per highlight
create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  hl_id text not null,
  book_local_id text not null,
  chapter integer not null,
  text text not null,
  color text not null,
  note text default '',
  ts text
);

-- 3. Reading stats table — one row per user
create table if not exists reading_stats (
  user_id uuid references auth.users(id) on delete cascade primary key,
  words_read integer default 0,
  streak integer default 1,
  last_active_date text,
  updated_at timestamptz default now()
);

-- ============================================================
-- Row Level Security — each user can only see/edit their own data
-- ============================================================

alter table books enable row level security;
alter table highlights enable row level security;
alter table reading_stats enable row level security;

create policy "Users manage their own books"
  on books for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own highlights"
  on highlights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own stats"
  on reading_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Done. After running this:
-- 1. Go to Authentication → Providers and make sure "Email" is enabled
--    (it is by default). For magic links, no further config needed.
-- 2. Go to Authentication → URL Configuration and add your GitHub Pages
--    URL (e.g. https://yourusername.github.io/titan-reader/) to the
--    "Redirect URLs" allow-list, or magic links won't redirect back
--    to your app correctly.
-- 3. Copy your Project URL and anon public key from Settings → API
--    and paste them into SUPABASE_URL / SUPABASE_KEY in the HTML file.
-- ============================================================
