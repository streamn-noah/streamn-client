# Task List

## Phase 1 — Setup
- [x] Install @supabase/supabase-js @supabase/ssr
- [x] Update .env with Supabase credentials
- [x] Create supabase/migrations/001_initial_schema.sql
- [x] Create lib/supabase.ts (browser + server clients)
- [x] Create lib/supabase-types.ts (DB type definitions)

## Phase 2 — Auth Context & Middleware
- [x] Create components/providers/auth-provider.tsx
- [x] Update app/layout.tsx to wrap with AuthProvider
- [x] Create app/auth/callback/route.ts
- [x] Create app/auth/page.tsx (sign-in UI)

## Phase 3 — Onboarding
- [x] Create app/onboarding/page.tsx
- [x] Create components/streamn/onboarding-flow.tsx (genre + movie steps)

## Phase 4 — Library Page
- [x] Create app/library/page.tsx
- [x] Create components/streamn/library-app.tsx (History/Liked/Watchlists/Settings tabs)
- [x] Create components/streamn/watchlist-detail.tsx

## Phase 5 — Lib user actions
- [x] Create lib/user-actions.ts (like, watchlist, watch history, invites)

## Phase 6 — API Routes
- [x] Create app/api/auth/sync-watch/route.ts
- [x] Create app/api/library/watchlists/route.ts
- [x] Create app/api/library/watchlists/[id]/route.ts
- [x] Create app/api/user/profile/route.ts
- [x] Create app/api/invites/route.ts (create & accept invite links)

## Phase 7 — Feature Wiring
- [x] Modify media-detail-content.tsx (Like + +Watchlist buttons)
- [x] Modify streamn-nav.tsx (Library link + user avatar)
- [x] Modify discover-app.tsx (public watchlists row + modal)

## Phase 8 — CSS
- [x] Add all new CSS classes to globals.css

## Phase 9 — Supabase DB additions
- [x] Add watchlist_invites table to schema
- [x] Apply schema to Supabase project (via MCP)
- [x] Add invite read policies for private list sharing
