# Streamn — Auth, Library Page, Likes, Watchlists & Onboarding

A major feature uplift adding Supabase-backed authentication, a full **Library** page, user-level personalization (likes, watchlists, watch history sync), friend sharing, and a post-signup onboarding flow.

---

## Decisions (Confirmed ✅)

| Topic | Decision |
|---|---|
| Apple Sign-In | Skip for now; ship Google SSO + Email OTP first |
| Supabase | Project URL: `https://rnoldomgckeuaqtibtbm.supabase.co` |
| Watch history migration | Sync localStorage → Supabase on first login |
| Public watchlists on Discover | Yes — Spotify-style row; tap → modal with list info + movies + "Add to library" |
| Friend sharing | Invite-link system: generates a link, recipient sees accept/decline prompt |
| Onboarding movie picker | TMDB search + popular movies fallback |

---

## Architecture Overview

```
Supabase
  ├── auth.users           (managed by Supabase Auth)
  ├── profiles             (user display name, avatar, taste profile JSON)
  ├── liked_media          (userId, mediaId, mediaType, title, genres[], directorId, etc.)
  ├── watch_history        (userId, mediaId, mediaType, progressSeconds, updatedAt)
  ├── watchlists           (id, userId, name, description, privacy: public|friends|private)
  ├── watchlist_items      (watchlistId, mediaId, mediaType, addedAt)
  └── follows              (followerId, followingId)
```

All client data fetching goes through a thin `lib/supabase.ts` wrapper. Auth state is managed via a React Context (`AuthProvider`) wrapping the whole app.

---

## Proposed Changes

### 1. Dependencies & Environment

#### [MODIFY] [package.json](file:///c:/Users/PC/Documents/GitHub/streamn/Web/package.json)
- Add `@supabase/supabase-js` and `@supabase/ssr` (for Next.js cookie-based sessions)

#### [MODIFY] [.env](file:///c:/Users/PC/Documents/GitHub/streamn/Web/.env)
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### 2. Supabase Client & Auth Context

#### [NEW] `lib/supabase.ts`
- Browser-side Supabase client (uses `createBrowserClient` from `@supabase/ssr`)
- Server-side Supabase client helper for API routes

#### [NEW] `lib/supabase-types.ts`
- TypeScript types for all DB tables (generated from schema or hand-written)

#### [NEW] `lib/user-actions.ts`
- `likeMedia(item)`, `unlikeMedia(item)`, `isLiked(id, type)` — Supabase mutations
- `addToWatchlist(watchlistId, item)`, `removeFromWatchlist(...)` 
- `createWatchlist(name, privacy)`, `getMyWatchlists()`
- `getWatchHistory()`, `syncWatchSession(item, progress)` — replaces localStorage-only approach
- `followUser(userId)`, `getFollowers()`, `getFollowing()`

#### [NEW] `components/providers/auth-provider.tsx`
- React context wrapping `supabase.auth.onAuthStateChange`
- Exposes `user`, `profile`, `loading`, `signOut()` 
- Wraps the app so any component can call `useAuth()`

#### [MODIFY] `app/layout.tsx`
- Wrap children with `<AuthProvider>`

---

### 3. Authentication Flow

#### [NEW] `app/auth/page.tsx`
- Full-page sign-in: Google SSO button, Email OTP input, loading states
- Clean dark design matching the Streamn aesthetic
- On successful auth → redirect to `/` (or `/onboarding` if first login)

#### [NEW] `app/auth/callback/route.ts`
- Supabase `exchangeCodeForSession` handler (required for OAuth + email magic link)

#### [NEW] `app/onboarding/page.tsx` + `components/streamn/onboarding-flow.tsx`
Multi-step modal/page:
- **Step 1 — Genres**: Grid of genre chips (pulled from TMDB genre list), user picks ≥3 favourites
- **Step 2 — Favourite Movies**: Search or pick from a curated TMDB popular list; user selects ≥1; we store title, genres, director, cast from TMDB
- **Step 3 — Done**: Summarise their taste profile and redirect to Discover

Taste data stored in `profiles.taste_profile` as JSON:
```json
{
  "favoriteGenres": [28, 12, 878],
  "favoriteMovies": [{ "id": 123, "title": "...", "genres": [...], "director": "..." }],
  "directors": ["Christopher Nolan"],
  "themes": ["sci-fi", "action"]
}
```

---

### 4. Library Page

#### [NEW] `app/library/page.tsx`
Server component — checks session, redirects to `/auth` if unauthenticated.

#### [NEW] `components/streamn/library-app.tsx`
Tabbed UI with four tabs:
- **History** — watch history synced from Supabase; cards with progress bars
- **Liked** — grid of liked movies/shows; click → detail modal with unlike button
- **Watchlists** — card grid of the user's playlists; create new button; click opens watchlist detail
- **Settings** — display name, avatar (Supabase Storage upload), notification prefs, sign-out button

#### [NEW] `components/streamn/watchlist-detail.tsx`
- Drawer/modal showing all items in a watchlist
- Privacy toggle (public / friends / private)
- Share button → copies link or shows friend picker
- Remove items from list

#### [MODIFY] `components/streamn/streamn-nav.tsx`
- Add **Library** nav link with `Library` icon (BookMarked from lucide)
- Conditionally show user avatar badge when logged in

---

### 5. Like & Watchlist Buttons (Media Detail)

#### [MODIFY] `components/streamn/media-detail-content.tsx`
- Add **Like button** (heart icon) — toggled, writes to `liked_media` table
- Add **+ Watchlist button** — opens a small popover listing user's watchlists + "New list" option
- Both require auth; if not logged in, clicking → redirect to `/auth`

---

### 6. Navigation — "Add to Watchlist" from Discovery cards

#### [MODIFY] `components/streamn/discover-app.tsx`
- Long-press / hover reveal shows a small "＋" button on each card that opens the watchlist picker
- (Mobile-friendly: tap card → detail modal → use the button there)

---

### 7. API Routes

#### [NEW] `app/api/auth/sync-watch/route.ts`
- `POST` — authenticated endpoint; accepts `{ item, progressSeconds, ... }` and upserts into `watch_history` table
- Used by the watch player to persist progress server-side alongside localStorage

#### [NEW] `app/api/library/watchlists/route.ts`
- `GET` — return public watchlists (for Discover page integration later)
- `POST` — create a new watchlist

#### [NEW] `app/api/library/watchlists/[id]/route.ts`
- `GET`, `PATCH` (rename/privacy), `DELETE`

#### [NEW] `app/api/user/profile/route.ts`
- `GET` / `PATCH` — fetch and update user profile + taste_profile

---

### 8. Supabase DB Schema (SQL migration)

#### [NEW] `supabase/migrations/001_initial_schema.sql`
```sql
-- profiles
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  taste_profile jsonb default '{}',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- liked_media
create table liked_media (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  media_id int not null,
  media_type text not null,
  title text,
  poster_path text,
  genres text[],
  liked_at timestamptz default now(),
  unique(user_id, media_id, media_type)
);
alter table liked_media enable row level security;
create policy "Users manage own likes" on liked_media using (auth.uid() = user_id);

-- watch_history (server-synced)
create table watch_history (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  media_id int not null,
  media_type text not null,
  title text,
  poster_path text,
  progress_seconds int default 0,
  season_number int default 1,
  episode_number int default 1,
  updated_at timestamptz default now(),
  unique(user_id, media_id, media_type)
);
alter table watch_history enable row level security;
create policy "Users manage own history" on watch_history using (auth.uid() = user_id);

-- watchlists
create table watchlists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text,
  privacy text default 'private' check (privacy in ('public','friends','private')),
  created_at timestamptz default now()
);
alter table watchlists enable row level security;
create policy "Owner full access" on watchlists using (auth.uid() = user_id);
create policy "Public watchlists readable" on watchlists for select using (privacy = 'public');

-- watchlist_items
create table watchlist_items (
  id bigint generated always as identity primary key,
  watchlist_id uuid references watchlists on delete cascade not null,
  media_id int not null,
  media_type text not null,
  title text,
  poster_path text,
  added_at timestamptz default now(),
  unique(watchlist_id, media_id, media_type)
);
alter table watchlist_items enable row level security;
create policy "Items visible if list is visible" on watchlist_items for select
  using (exists (select 1 from watchlists w where w.id = watchlist_id and (w.user_id = auth.uid() or w.privacy = 'public')));
create policy "Owner manages items" on watchlist_items for all using (
  exists (select 1 from watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);

-- follows
create table follows (
  follower_id uuid references auth.users on delete cascade,
  following_id uuid references auth.users on delete cascade,
  primary key (follower_id, following_id)
);
alter table follows enable row level security;
create policy "Anyone can read follows" on follows for select using (true);
create policy "Users manage own follows" on follows for all using (auth.uid() = follower_id);
```

---

### 9. CSS

#### [MODIFY] `app/globals.css`
New classes needed:
- `.library-tab`, `.library-tab-active` — tab pills for History / Liked / Watchlists / Settings
- `.watchlist-card` — playlist-style card with cover mosaic
- `.like-button`, `.like-button-active` — heart button with red fill animation
- `.onboarding-overlay` — full-screen gradient modal for onboarding steps
- `.auth-shell` — centered card for sign-in page

---

## Verification Plan

### Automated Tests
- None currently in the project; this is frontend-heavy so we'll rely on manual flows.

### Manual Verification
1. Visit `/auth` → sign in with Google → confirm redirect and session
2. Visit `/auth` → sign in with email OTP → confirm redirect
3. On first login → confirm onboarding modal appears, genre + movie steps work, data appears in Supabase `profiles` table
4. On Discover page, click a media item → confirm Like and +Watchlist buttons appear and write to DB
5. Navigate to `/library` → confirm History, Liked, Watchlists tabs all show correct data
6. Create a watchlist → add items → toggle privacy → copy share link
7. Sign out → confirm redirect to `/auth`, nav shows no avatar

