-- ============================================================
-- Streamn Initial Schema
-- Run this in the Supabase SQL editor (Project > SQL Editor)
-- ============================================================

-- ----------------------------------------------------------
-- 1. PROFILES
-- ----------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  taste_profile jsonb not null default '{}',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------
-- 2. LIKED MEDIA
-- ----------------------------------------------------------
create table if not exists public.liked_media (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  media_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  backdrop_path text,
  overview text,
  year text,
  vote_average float,
  genres text[] not null default '{}',
  genre_ids int[] not null default '{}',
  liked_at timestamptz not null default now(),
  unique (user_id, media_id, media_type)
);

alter table public.liked_media enable row level security;

create policy "Users manage their own likes"
  on public.liked_media for all
  using (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 3. WATCH HISTORY (server-synced)
-- ----------------------------------------------------------
create table if not exists public.watch_history (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  media_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  backdrop_path text,
  progress_seconds int not null default 0,
  season_number int not null default 1,
  episode_number int not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, media_id, media_type)
);

alter table public.watch_history enable row level security;

create policy "Users manage their own watch history"
  on public.watch_history for all
  using (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 4. WATCHLISTS
-- ----------------------------------------------------------
create table if not exists public.watchlists (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text,
  privacy text not null default 'private' check (privacy in ('public', 'private')),
  cover_poster_paths text[] not null default '{}',
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.watchlists enable row level security;

create policy "Owners have full access to their watchlists"
  on public.watchlists for all
  using (auth.uid() = user_id);

create policy "Public watchlists are readable by anyone"
  on public.watchlists for select
  using (privacy = 'public');

-- ----------------------------------------------------------
-- 5. WATCHLIST ITEMS
-- ----------------------------------------------------------
create table if not exists public.watchlist_items (
  id bigint generated always as identity primary key,
  watchlist_id uuid references public.watchlists on delete cascade not null,
  media_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  backdrop_path text,
  year text,
  vote_average float,
  added_at timestamptz not null default now(),
  unique (watchlist_id, media_id, media_type)
);

alter table public.watchlist_items enable row level security;

create policy "Items visible if list is accessible"
  on public.watchlist_items for select
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id
        and (w.user_id = auth.uid() or w.privacy = 'public')
    )
  );

create policy "Owners manage watchlist items"
  on public.watchlist_items for all
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

-- Trigger: keep watchlist cover_poster_paths and item_count in sync
create or replace function public.sync_watchlist_meta()
returns trigger as $$
declare
  wid uuid;
  new_count int;
  new_covers text[];
begin
  wid := coalesce(new.watchlist_id, old.watchlist_id);

  select count(*), array_agg(poster_path order by added_at desc)
  into new_count, new_covers
  from public.watchlist_items
  where watchlist_id = wid and poster_path is not null;

  update public.watchlists
  set
    item_count = new_count,
    cover_poster_paths = new_covers[1:4],
    updated_at = now()
  where id = wid;

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists on_watchlist_item_change on public.watchlist_items;
create trigger on_watchlist_item_change
  after insert or delete on public.watchlist_items
  for each row execute function public.sync_watchlist_meta();

-- ----------------------------------------------------------
-- 6. WATCHLIST INVITES
-- ----------------------------------------------------------
create table if not exists public.watchlist_invites (
  id uuid not null default gen_random_uuid() primary key,
  watchlist_id uuid references public.watchlists on delete cascade not null,
  created_by uuid references auth.users on delete cascade not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.watchlist_invites enable row level security;

create policy "Invite creators can manage their invites"
  on public.watchlist_invites for all
  using (auth.uid() = created_by);

create policy "Anyone can read invites to accept"
  on public.watchlist_invites for select
  using (true);

-- ----------------------------------------------------------
-- 7. INVITE READ POLICIES (private list sharing)
-- ----------------------------------------------------------
create policy "Invite recipients can read shared watchlists"
  on public.watchlists for select
  using (
    exists (
      select 1 from public.watchlist_invites wi
      where wi.watchlist_id = id
        and wi.expires_at > now()
    )
  );

create policy "Invite recipients can read shared watchlist items"
  on public.watchlist_items for select
  using (
    exists (
      select 1 from public.watchlists w
      join public.watchlist_invites wi on wi.watchlist_id = w.id
      where w.id = watchlist_id
        and wi.expires_at > now()
    )
  );

-- ----------------------------------------------------------
-- Done
-- ============================================================
