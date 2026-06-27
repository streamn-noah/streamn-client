"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookMarked,
  Clock,
  Globe,
  Heart,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { StreamnNav } from "@/components/streamn/streamn-nav";
import { WatchlistDetail } from "@/components/streamn/watchlist-detail";
import type { Database } from "@/lib/supabase-types";
import { tmdbImage, type MediaType } from "@/lib/media";
import { watchHref } from "@/lib/streamn-storage";
import {
  createWatchlist,
  getLikedMedia,
  getMyWatchlists,
  getWatchHistory,
} from "@/lib/user-actions";

type Tab = "history" | "liked" | "watchlists" | "settings";
type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"];
type LikedRow = Database["public"]["Tables"]["liked_media"]["Row"];
type HistoryRow = Database["public"]["Tables"]["watch_history"]["Row"];

function formatProgress(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs) return `${hrs}h ${mins % 60}m watched`;
  return `${mins}m watched`;
}

export function LibraryApp() {
  const router = useRouter();
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>("history");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [liked, setLiked] = useState<LikedRow[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeWatchlist, setActiveWatchlist] = useState<WatchlistRow | null>(
    null,
  );
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    const [historyRows, likedRows, watchlistRows] = await Promise.all([
      getWatchHistory(),
      getLikedMedia(),
      getMyWatchlists(),
    ]);
    setHistory(historyRows);
    setLiked(likedRows);
    setWatchlists(watchlistRows);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (profile && !profile.onboarding_complete) {
      router.replace("/onboarding");
      return;
    }
    setDisplayName(profile?.display_name ?? "");
    loadData();
  }, [loadData, loading, profile, router, user]);

  async function handleCreateWatchlist() {
    const name = window.prompt("Watchlist name");
    if (!name?.trim()) return;
    const created = await createWatchlist(name.trim());
    if (created) {
      setWatchlists((current) => [created, ...current]);
      setActiveWatchlist(created);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    });
    await refreshProfile();
    setSavingProfile(false);
  }

  if (loading || !user) {
    return (
      <main className='library-shell flex min-h-screen items-center justify-center'>
        <Loader2 className='size-8 animate-spin text-white/50' />
      </main>
    );
  }

  const tabs: { id: Tab; label: string; Icon: typeof Clock }[] = [
    { id: "history", label: "History", Icon: Clock },
    { id: "liked", label: "Liked", Icon: Heart },
    { id: "watchlists", label: "Watchlists", Icon: BookMarked },
    { id: "settings", label: "Settings", Icon: Settings },
  ];

  return (
    <main className='library-shell pb-28'>
      <div className='morph-bg' />
      <div className='grain' />
      <StreamnNav />

      <section className='relative z-10 mx-auto w-full max-w-[1200px] px-5 pt-28 md:px-10'>
        <div className='library-header'>
          <div>
            <p className='text-sm font-bold uppercase tracking-[0.2em] text-white/40'>
              Your space
            </p>
            <h1 className='library-title'>Library</h1>
          </div>
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=''
              className='library-avatar'
              src={profile.avatar_url}
            />
          ) : (
            <div className='library-avatar library-avatar-fallback'>
              {(profile?.display_name ?? user.email ?? "?")[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <div className='library-tabs'>
          {tabs.map(({ id, label, Icon }) => (
            <button
              className={`library-tab ${tab === id ? "library-tab-active" : ""}`}
              key={id}
              onClick={() => setTab(id)}
              type='button'
            >
              <Icon className='size-4' />
              {label}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <div className='empty-state min-h-48'>
            <Loader2 className='mx-auto size-6 animate-spin text-white/40' />
          </div>
        ) : null}

        {!dataLoading && tab === "history" ? (
          history.length ? (
            <div className='library-grid'>
              {history.map((entry) => (
                <Link
                  className='library-media-card'
                  href={watchHref(
                    {
                      id: entry.media_id,
                      mediaType: entry.media_type as MediaType,
                      title: entry.title,
                      subtitle: "",
                      overview: "",
                      posterPath: entry.poster_path,
                      backdropPath: entry.backdrop_path,
                      voteAverage: 0,
                      year: "",
                      genreIds: [],
                    },
                    {
                      season: entry.season_number,
                      episode: entry.episode_number,
                    },
                  )}
                  key={entry.id}
                >
                  <Image
                    src={tmdbImage(entry.poster_path, "w342")}
                    alt={entry.title}
                    fill
                    sizes='180px'
                    className='object-cover'
                  />
                  <span className='library-card-overlay'>
                    <span className='block truncate font-bold'>{entry.title}</span>
                    <span className='mt-1 block text-xs text-white/55'>
                      {formatProgress(entry.progress_seconds)}
                    </span>
                    <span className='library-progress-bar'>
                      <span
                        className='library-progress-fill'
                        style={{ width: "42%" }}
                      />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className='empty-state'>No watch history yet. Start streaming!</div>
          )
        ) : null}

        {!dataLoading && tab === "liked" ? (
          liked.length ? (
            <div className='library-grid'>
              {liked.map((entry) => (
                <div className='library-media-card' key={entry.id}>
                  <Image
                    src={tmdbImage(entry.poster_path, "w342")}
                    alt={entry.title}
                    fill
                    sizes='180px'
                    className='object-cover'
                  />
                  <span className='library-card-overlay'>
                    <span className='block truncate font-bold'>{entry.title}</span>
                    <span className='mt-1 block text-xs text-white/55'>
                      {entry.year}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className='empty-state'>
              Nothing liked yet. Tap the heart on any title.
            </div>
          )
        ) : null}

        {!dataLoading && tab === "watchlists" ? (
          <>
            <div className='mb-5 flex justify-end'>
              <button
                className='primary-button'
                onClick={handleCreateWatchlist}
                type='button'
              >
                <Plus className='size-5' />
                New watchlist
              </button>
            </div>
            {watchlists.length ? (
              <div className='watchlist-grid'>
                {watchlists.map((list) => (
                  <button
                    className='watchlist-card'
                    key={list.id}
                    onClick={() => setActiveWatchlist(list)}
                    type='button'
                  >
                    <div className='watchlist-card-covers'>
                      {(list.cover_poster_paths.length
                        ? list.cover_poster_paths
                        : [null, null, null, null]
                      )
                        .slice(0, 4)
                        .map((path, index) => (
                          <span className='watchlist-cover-tile' key={index}>
                            {path ? (
                              <Image
                                src={tmdbImage(path, "w185")}
                                alt=''
                                fill
                                sizes='80px'
                                className='object-cover'
                              />
                            ) : null}
                          </span>
                        ))}
                    </div>
                    <div className='watchlist-card-meta'>
                      <span className='block truncate font-bold'>{list.name}</span>
                      <span className='mt-1 flex items-center gap-1.5 text-xs text-white/50'>
                        {list.privacy === "public" ? (
                          <Globe className='size-3.5' />
                        ) : (
                          <Lock className='size-3.5' />
                        )}
                        {list.item_count} title{list.item_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className='empty-state'>
                Create your first watchlist — like a playlist for movies.
              </div>
            )}
          </>
        ) : null}

        {!dataLoading && tab === "settings" ? (
          <div className='library-settings'>
            <label className='library-settings-field'>
              <span>Display name</span>
              <input
                className='auth-input'
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </label>
            <button
              className='primary-button'
              disabled={savingProfile}
              onClick={handleSaveProfile}
              type='button'
            >
              {savingProfile ? (
                <Loader2 className='size-5 animate-spin' />
              ) : (
                "Save profile"
              )}
            </button>
            <button
              className='ghost-button library-signout'
              onClick={async () => {
                await signOut();
                router.replace("/auth");
              }}
              type='button'
            >
              <LogOut className='size-5' />
              Sign out
            </button>
          </div>
        ) : null}
      </section>

      {activeWatchlist ? (
        <WatchlistDetail
          onClose={() => setActiveWatchlist(null)}
          onUpdated={loadData}
          watchlist={activeWatchlist}
        />
      ) : null}
    </main>
  );
}
