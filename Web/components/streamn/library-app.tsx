"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookMarked,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Globe,
  Heart,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Search,
  Settings,
  Share2,
  Star,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { DefaultAvatarFace } from "@/components/streamn/default-avatar";
import { StreamnNav } from "@/components/streamn/streamn-nav";
import type { Database } from "@/lib/supabase-types";
import { tmdbImage, type MediaDetail, type MediaSummary, type MediaType } from "@/lib/media";
import { watchHref } from "@/lib/streamn-storage";
import {
  addToWatchlist,
  createInviteLink,
  createWatchlist,
  deleteWatchlist,
  getLikedMedia,
  getMyWatchlists,
  getWatchHistory,
  getWatchlistItems,
  removeFromWatchHistory,
  removeFromWatchlist,
  unlikeMedia,
  updateWatchlist,
} from "@/lib/user-actions";

type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"];
type LikedRow = Database["public"]["Tables"]["liked_media"]["Row"];
type HistoryRow = Database["public"]["Tables"]["watch_history"]["Row"];
type WatchlistItemRow = Database["public"]["Tables"]["watchlist_items"]["Row"];

function formatProgress(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m watched`;
  return `${mins}m watched`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Media Card Component with Close (X) overlay button
// ─────────────────────────────────────────────────────────────────────────────
function LibraryMediaCard({
  title,
  posterPath,
  subtitle,
  rating,
  onClick,
  onRemove,
}: {
  title: string;
  posterPath: string | null;
  subtitle?: string;
  rating?: number | null;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="group relative flex w-32 sm:w-40 md:w-44 shrink-0 flex-col gap-1.5 cursor-pointer"
      onClick={onClick}
    >
      <div className="relative aspect-[1/1.4] w-full overflow-hidden rounded-xl bg-zinc-900 border border-white/10 shadow-md group-hover:-translate-y-1.5 group-hover:ring-2 group-hover:ring-white/40 group-hover:border-white/50 transition-all duration-300">
        <Image
          src={tmdbImage(posterPath, "w500")}
          alt={title}
          fill
          sizes="(max-width: 768px) 160px, 200px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Close Button Overlay */}
        <button
          className="absolute top-2 right-2 z-20 rounded-full bg-black/75 p-1.5 text-white/80 hover:bg-white hover:text-black transition-all shadow-md"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          type="button"
          aria-label="Remove item"
          title="Remove from row"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="line-clamp-1 text-xs sm:text-sm font-semibold text-white group-hover:text-white/90 transition-colors">
          {title}
        </h3>
        <div className="flex items-center gap-1 text-[11px] sm:text-xs font-medium text-white/50">
          {rating !== undefined && rating !== null ? (
            <>
              <Star className="size-3 fill-white text-white shrink-0" />
              <span>{rating ? rating.toFixed(1) : "N/A"}</span>
              {subtitle ? <span>·</span> : null}
            </>
          ) : null}
          {subtitle ? <span className="truncate">{subtitle}</span> : null}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist Avatar Stack Component
// ─────────────────────────────────────────────────────────────────────────────
function WatchlistAvatarStack({
  userAvatar,
  privacy,
}: {
  userAvatar?: string | null;
  privacy?: string;
}) {
  return (
    <div className="flex items-center -space-x-2 mr-1 sm:mr-2" title="Watchlist Members">
      <div className="relative size-6 sm:size-7 rounded-full ring-2 ring-black overflow-hidden bg-zinc-800 shrink-0 z-20 shadow-sm">
        {userAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Member" src={userAvatar} className="w-full h-full object-cover" />
        ) : (
          <DefaultAvatarFace className="w-full h-full" />
        )}
      </div>

      <div className="relative size-6 sm:size-7 rounded-full ring-2 ring-black overflow-hidden bg-zinc-800 shrink-0 z-10 shadow-sm">
        <DefaultAvatarFace className="w-full h-full" />
      </div>

      {privacy === "public" && (
        <div className="size-6 sm:size-7 rounded-full ring-2 ring-black bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white/80 shrink-0 z-0 shadow-sm">
          +1
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal Scrolling Media Row Component
// ─────────────────────────────────────────────────────────────────────────────
function LibraryRow({
  title,
  subtitle,
  children,
  avatarStack,
  onViewAll,
  onAdd,
  onInvite,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  avatarStack?: React.ReactNode;
  onViewAll?: () => void;
  onAdd?: () => void;
  onInvite?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    trackRef.current?.scrollBy({ left: -(window.innerWidth * 0.6), behavior: "smooth" });
  };
  const scrollRight = () => {
    trackRef.current?.scrollBy({ left: window.innerWidth * 0.6, behavior: "smooth" });
  };

  return (
    <section className="relative my-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-white/50">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {avatarStack}

          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all border border-white/5"
              type="button"
            >
              <Plus className="size-3.5" />
              <span>Add</span>
            </button>
          )}

          {onInvite && (
            <button
              onClick={onInvite}
              className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all border border-white/5"
              type="button"
              title="Share / Watchlist Settings"
            >
              <UserPlus className="size-3.5" />
              <span>Invite</span>
            </button>
          )}

          {onViewAll && (
            <button
              onClick={onViewAll}
              className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all border border-white/5"
              type="button"
            >
              <span>View All</span>
              <ChevronRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="relative group/track">
        <button
          className="absolute left-0 top-0 bottom-0 z-30 w-10 bg-gradient-to-r from-black/90 via-black/50 to-transparent opacity-0 group-hover/track:opacity-100 transition-opacity flex items-center justify-center text-white"
          onClick={scrollLeft}
          aria-label="Scroll left"
          type="button"
        >
          <ChevronLeft className="size-6 text-white drop-shadow-md" />
        </button>

        <div
          className="flex items-center gap-3.5 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth py-2 px-1"
          ref={trackRef}
        >
          {children}
        </div>

        <button
          className="absolute right-0 top-0 bottom-0 z-30 w-10 bg-gradient-to-l from-black/90 via-black/50 to-transparent opacity-0 group-hover/track:opacity-100 transition-opacity flex items-center justify-center text-white"
          onClick={scrollRight}
          aria-label="Scroll right"
          type="button"
        >
          <ChevronRight className="size-6 text-white drop-shadow-md" />
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LIBRARY APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function LibraryApp() {
  const router = useRouter();
  const { user, profile, loading, signOut, refreshProfile } = useAuth();

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [liked, setLiked] = useState<LikedRow[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [watchlistItemsMap, setWatchlistItemsMap] = useState<Record<string, WatchlistItemRow[]>>({});
  const [dataLoading, setDataLoading] = useState(true);

  // Profile Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Create Watchlist modal state
  const [showCreateWatchlistModal, setShowCreateWatchlistModal] = useState(false);
  const [createListName, setCreateListName] = useState("");
  const [createListPrivacy, setCreateListPrivacy] = useState<"public" | "private">("private");
  const [createListItems, setCreateListItems] = useState<MediaSummary[]>([]);
  const [creatingList, setCreatingList] = useState(false);

  // Add Item to Watchlist modal state
  const [addModalWatchlist, setAddModalWatchlist] = useState<WatchlistRow | null>(null);

  // Watchlist Invite & Settings modal state
  const [inviteModalWatchlist, setInviteModalWatchlist] = useState<WatchlistRow | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  // View All modal state
  const [viewAllType, setViewAllType] = useState<"history" | "liked" | "watchlist" | null>(null);
  const [viewAllWatchlist, setViewAllWatchlist] = useState<WatchlistRow | null>(null);

  // Common Search inside modals
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);



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

    // Fetch items for each watchlist
    const itemsMap: Record<string, WatchlistItemRow[]> = {};
    await Promise.all(
      watchlistRows.map(async (list) => {
        const items = await getWatchlistItems(list.id);
        itemsMap[list.id] = items;
      })
    );
    setWatchlistItemsMap(itemsMap);
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

  // Handle Search for Movies/Shows
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Media detail fetcher
  async function openDetail(media: { id: number; mediaType: MediaType; title: string }) {
    const slug = (media.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    router.push(`/title/${media.mediaType}/${media.id}-${slug}`);
  }

  // Removal Handlers
  async function handleRemoveHistory(mediaId: number, mediaType: "movie" | "tv") {
    const ok = await removeFromWatchHistory(mediaId, mediaType);
    if (ok) {
      setHistory((prev) => prev.filter((item) => !(item.media_id === mediaId && item.media_type === mediaType)));
    }
  }

  async function handleRemoveLiked(mediaId: number, mediaType: "movie" | "tv") {
    const ok = await unlikeMedia(mediaId, mediaType);
    if (ok) {
      setLiked((prev) => prev.filter((item) => !(item.media_id === mediaId && item.media_type === mediaType)));
    }
  }

  async function handleRemoveWatchlistItem(watchlistId: string, mediaId: number, mediaType: "movie" | "tv") {
    const ok = await removeFromWatchlist(watchlistId, mediaId, mediaType);
    if (ok) {
      setWatchlistItemsMap((prev) => ({
        ...prev,
        [watchlistId]: (prev[watchlistId] ?? []).filter(
          (item) => !(item.media_id === mediaId && item.media_type === mediaType)
        ),
      }));
      setWatchlists((prev) =>
        prev.map((list) =>
          list.id === watchlistId ? { ...list, item_count: Math.max(0, list.item_count - 1) } : list
        )
      );
    }
  }

  // Watchlist Operations
  async function handleCreateWatchlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createListName.trim()) return;
    setCreatingList(true);

    const newList = await createWatchlist(createListName.trim(), createListPrivacy);
    if (newList) {
      // Add pre-selected search items
      for (const item of createListItems) {
        await addToWatchlist(newList.id, item);
      }
      setCreateListName("");
      setCreateListItems([]);
      setSearchQuery("");
      setShowCreateWatchlistModal(false);
      await loadData();
    }
    setCreatingList(false);
  }

  async function handleAddItemToWatchlist(listId: string, item: MediaSummary) {
    const ok = await addToWatchlist(listId, item);
    if (ok) {
      const updatedItems = await getWatchlistItems(listId);
      setWatchlistItemsMap((prev) => ({ ...prev, [listId]: updatedItems }));
      setWatchlists((prev) =>
        prev.map((list) => (list.id === listId ? { ...list, item_count: list.item_count + 1 } : list))
      );
    }
  }

  async function handleShareWatchlist(watchlistId: string) {
    setInviteBusy(true);
    const link = await createInviteLink(watchlistId);
    if (link) {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
    setInviteBusy(false);
  }

  async function handleTogglePrivacy(watchlist: WatchlistRow) {
    const nextPrivacy = watchlist.privacy === "public" ? "private" : "public";
    setInviteBusy(true);
    const ok = await updateWatchlist(watchlist.id, { privacy: nextPrivacy });
    if (ok) {
      setWatchlists((prev) =>
        prev.map((l) => (l.id === watchlist.id ? { ...l, privacy: nextPrivacy } : l))
      );
      if (inviteModalWatchlist?.id === watchlist.id) {
        setInviteModalWatchlist({ ...watchlist, privacy: nextPrivacy });
      }
    }
    setInviteBusy(false);
  }

  async function handleDeleteWatchlistSubmit(watchlistId: string) {
    if (!window.confirm("Are you sure you want to delete this watchlist?")) return;
    setInviteBusy(true);
    const ok = await deleteWatchlist(watchlistId);
    if (ok) {
      setWatchlists((prev) => prev.filter((l) => l.id !== watchlistId));
      setInviteModalWatchlist(null);
    }
    setInviteBusy(false);
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
    setShowSettingsModal(false);
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="size-8 animate-spin text-white/50" />
      </main>
    );
  }

  return (
    <main className="bg-black min-h-screen text-white pb-28 pl-0 md:pl-[72px] transition-all duration-300">
      <StreamnNav />

      {/* Top Header Section */}
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-5 pt-28 pb-6 md:px-10">
        <div className="flex flex-col items-start md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-white/10">
          {/* Left-Aligned Avatar and User Info */}
          <div className="flex items-center gap-4 text-left">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={profile.display_name ?? "User Avatar"}
                className="size-14 md:size-16 rounded-full object-cover ring-2 ring-zinc-700/80 shadow-xl"
                src={profile.avatar_url}
              />
            ) : (
              <DefaultAvatarFace className="size-14 md:size-16" />
            )}
            <div className="text-left min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-white/50 truncate max-w-[240px] sm:max-w-sm">
                {user.email}
              </p>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white truncate max-w-[240px] sm:max-w-md">
                {profile?.display_name || user.email?.split("@")[0] || "User"}
              </h1>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setCreateListItems([]);
                setShowCreateWatchlistModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white hover:bg-white/90 text-black font-semibold text-xs sm:text-sm shadow-md transition-all active:scale-95"
              type="button"
            >
              <Plus className="size-4" />
              <span>Create Watchlist</span>
            </button>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10 shadow-md active:scale-95"
              type="button"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="size-5" />
            </button>
          </div>
        </div>

        {/* Content Rows */}
        {dataLoading ? (
          <div className="flex min-h-60 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-white/40" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Watch History Row */}
            {history.length > 0 ? (
              <LibraryRow
                title="Watch History"
                subtitle={`${history.length} title${history.length === 1 ? "" : "s"}`}
                onViewAll={() => setViewAllType("history")}
              >
                {history.map((entry) => (
                  <LibraryMediaCard
                    key={`history-${entry.id}`}
                    title={entry.title}
                    posterPath={entry.poster_path}
                    subtitle={formatProgress(entry.progress_seconds)}
                    onClick={() =>
                      router.push(
                        watchHref(
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
                          { season: entry.season_number, episode: entry.episode_number }
                        )
                      )
                    }
                    onRemove={() =>
                      handleRemoveHistory(entry.media_id, entry.media_type as MediaType)
                    }
                  />
                ))}
              </LibraryRow>
            ) : (
              <div className="py-6 border-b border-white/5 text-sm text-white/40 text-center">
                No watch history yet. Start watching movies or shows!
              </div>
            )}

            {/* Liked Titles Row */}
            {liked.length > 0 ? (
              <LibraryRow
                title="Liked Titles"
                subtitle={`${liked.length} saved title${liked.length === 1 ? "" : "s"}`}
                onViewAll={() => setViewAllType("liked")}
              >
                {liked.map((entry) => (
                  <LibraryMediaCard
                    key={`liked-${entry.id}`}
                    title={entry.title}
                    posterPath={entry.poster_path}
                    subtitle={entry.year || undefined}
                    rating={entry.vote_average}
                    onClick={() =>
                      openDetail({
                        id: entry.media_id,
                        mediaType: entry.media_type as MediaType,
                        title: entry.title,
                      })
                    }
                    onRemove={() =>
                      handleRemoveLiked(entry.media_id, entry.media_type as MediaType)
                    }
                  />
                ))}
              </LibraryRow>
            ) : (
              <div className="py-6 border-b border-white/5 text-sm text-white/40 text-center">
                Nothing liked yet. Tap the heart on any title to save it here!
              </div>
            )}

            {/* Individual Watchlist Rows */}
            {watchlists.length > 0 ? (
              watchlists.map((list) => {
                const items = watchlistItemsMap[list.id] ?? [];
                return (
                  <LibraryRow
                    key={`watchlist-${list.id}`}
                    title={list.name}
                    subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · ${
                      list.privacy === "public" ? "Public" : "Private"
                    }`}
                    avatarStack={
                      <WatchlistAvatarStack
                        userAvatar={profile?.avatar_url}
                        privacy={list.privacy}
                      />
                    }
                    onAdd={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setAddModalWatchlist(list);
                    }}
                    onInvite={() => setInviteModalWatchlist(list)}
                    onViewAll={() => {
                      setViewAllWatchlist(list);
                      setViewAllType("watchlist");
                    }}
                  >
                    {items.length > 0 ? (
                      items.map((item) => (
                        <LibraryMediaCard
                          key={`witem-${item.id}`}
                          title={item.title}
                          posterPath={item.poster_path}
                          subtitle={item.year || undefined}
                          rating={item.vote_average}
                          onClick={() =>
                            openDetail({
                              id: item.media_id,
                              mediaType: item.media_type as MediaType,
                              title: item.title,
                            })
                          }
                          onRemove={() =>
                            handleRemoveWatchlistItem(
                              list.id,
                              item.media_id,
                              item.media_type as MediaType
                            )
                          }
                        />
                      ))
                    ) : (
                      <div className="py-4 text-xs text-white/40 italic">
                        This watchlist is empty. Tap "+ Add" to add movies or shows!
                      </div>
                    )}
                  </LibraryRow>
                );
              })
            ) : (
              <div className="py-8 text-center bg-zinc-900/50 rounded-2xl border border-white/10 p-6 my-6">
                <BookMarked className="size-10 mx-auto text-white/30 mb-2" />
                <p className="font-semibold text-white">No Watchlists Yet</p>
                <p className="text-xs text-white/50 mt-1 mb-4">
                  Create custom watchlists to organize your favorite movies and shows.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setCreateListItems([]);
                    setShowCreateWatchlistModal(true);
                  }}
                  className="px-4 py-2 rounded-full bg-white hover:bg-white/90 text-black font-semibold text-xs transition-all"
                  type="button"
                >
                  Create Your First Watchlist
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────────────────
          SETTINGS MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-black border border-white/20 p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 font-bold text-lg text-white">
                <Settings className="size-5 text-white" />
                <span>Account Settings</span>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900/80 border border-white/15 px-4 py-3 text-sm text-white focus:outline-none focus:border-white transition-colors"
                  placeholder="Enter display name"
                />
              </div>

              <div className="text-xs text-white/40">
                Email: <span className="text-white/80 font-mono">{user.email}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-white/90 py-3 text-sm font-semibold text-black transition-all disabled:opacity-50"
                type="button"
              >
                {savingProfile ? (
                  <Loader2 className="size-4 animate-spin text-black" />
                ) : (
                  "Save Changes"
                )}
              </button>

              <button
                onClick={async () => {
                  await signOut();
                  router.replace("/auth");
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 py-3 text-sm font-semibold transition-all border border-white/10"
                type="button"
              >
                <LogOut className="size-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          CREATE WATCHLIST MODAL (with search)
         ───────────────────────────────────────────────────────────────────────────── */}
      {showCreateWatchlistModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setShowCreateWatchlistModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-black border border-white/20 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-2 font-bold text-lg text-white">
                <BookMarked className="size-5 text-white" />
                <span>Create Watchlist</span>
              </div>
              <button
                onClick={() => setShowCreateWatchlistModal(false)}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWatchlistSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                  Watchlist Name
                </label>
                <input
                  type="text"
                  required
                  value={createListName}
                  onChange={(e) => setCreateListName(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900/80 border border-white/15 px-4 py-3 text-sm text-white focus:outline-none focus:border-white transition-colors"
                  placeholder="e.g. Weekend Movie Marathon"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                  Privacy Settings
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateListPrivacy("private")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      createListPrivacy === "private"
                        ? "bg-white/20 border-white text-white"
                        : "bg-zinc-900/50 border-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    <Lock className="size-3.5" />
                    <span>Private</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateListPrivacy("public")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      createListPrivacy === "public"
                        ? "bg-white/20 border-white text-white"
                        : "bg-zinc-900/50 border-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    <Globe className="size-3.5" />
                    <span>Public</span>
                  </button>
                </div>
              </div>

              {/* Pre-selected Items List */}
              {createListItems.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                    Selected Titles ({createListItems.length})
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-zinc-900/80 rounded-xl border border-white/10">
                    {createListItems.map((item) => (
                      <span
                        key={`sel-${item.id}`}
                        className="flex items-center gap-1.5 text-xs bg-white/10 px-2.5 py-1 rounded-full text-white"
                      >
                        <span className="truncate max-w-[120px]">{item.title}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCreateListItems((prev) => prev.filter((i) => i.id !== item.id))
                          }
                          className="hover:text-white/60"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Search to Add Items */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                  Search & Add Movies/Shows
                </label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl bg-zinc-900/80 border border-white/15 pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-white transition-colors"
                    placeholder="Search by title..."
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-white/40" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-xl bg-zinc-900 border border-white/10 divide-y divide-white/5">
                    {searchResults.map((item) => {
                      const isAdded = createListItems.some((i) => i.id === item.id);
                      return (
                        <div
                          key={`search-${item.id}`}
                          className="flex items-center justify-between p-2 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative size-10 rounded overflow-hidden bg-black shrink-0">
                              <Image
                                src={tmdbImage(item.posterPath, "w92")}
                                alt={item.title}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                              <p className="text-[10px] text-white/50">
                                {item.year} · {item.mediaType === "movie" ? "Movie" : "Series"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isAdded) {
                                setCreateListItems((prev) => prev.filter((i) => i.id !== item.id));
                              } else {
                                setCreateListItems((prev) => [...prev, item]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                              isAdded
                                ? "bg-white/20 text-white border border-white/30"
                                : "bg-white text-black hover:bg-white/90"
                            }`}
                          >
                            {isAdded ? "Added" : "+ Add"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={creatingList || !createListName.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-white/90 py-3 text-sm font-semibold text-black transition-all disabled:opacity-50"
                >
                  {creatingList ? (
                    <Loader2 className="size-4 animate-spin text-black" />
                  ) : (
                    "Create Watchlist"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          ADD ITEMS MODAL (for existing watchlists)
         ───────────────────────────────────────────────────────────────────────────── */}
      {addModalWatchlist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setAddModalWatchlist(null)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-black border border-white/20 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="font-bold text-lg text-white">Add to "{addModalWatchlist.name}"</h3>
                <p className="text-xs text-white/50">Search movies or series to include</p>
              </div>
              <button
                onClick={() => setAddModalWatchlist(null)}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl bg-zinc-900/80 border border-white/15 pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-white transition-colors"
                placeholder="Search title..."
              />
              {searchLoading && (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-white/40" />
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
              {searchResults.length > 0 ? (
                searchResults.map((item) => {
                  const existingItems = watchlistItemsMap[addModalWatchlist.id] ?? [];
                  const isAdded = existingItems.some(
                    (i) => i.media_id === item.id && i.media_type === item.mediaType
                  );

                  return (
                    <div
                      key={`addsearch-${item.id}`}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/70 border border-white/5 hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-12 w-9 rounded overflow-hidden bg-black shrink-0">
                          <Image
                            src={tmdbImage(item.posterPath, "w92")}
                            alt={item.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                          <p className="text-xs text-white/50">
                            {item.year} · {item.mediaType === "movie" ? "Movie" : "Series"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isAdded}
                        onClick={() => handleAddItemToWatchlist(addModalWatchlist.id, item)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          isAdded
                            ? "bg-white/20 text-white/60 border border-white/20 opacity-80"
                            : "bg-white hover:bg-white/90 text-black"
                        }`}
                      >
                        {isAdded ? "Added" : "+ Add"}
                      </button>
                    </div>
                  );
                })
              ) : searchQuery ? (
                <div className="py-12 text-center text-xs text-white/40">
                  {searchLoading ? "Searching..." : "No matching titles found"}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-white/40">
                  Type a movie or show name above to search
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          WATCHLIST INVITE / SETTINGS MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {inviteModalWatchlist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setInviteModalWatchlist(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-black border border-white/20 p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="font-bold text-lg text-white">{inviteModalWatchlist.name}</h3>
                <p className="text-xs text-white/50">Share invite link & playlist settings</p>
              </div>
              <button
                onClick={() => setInviteModalWatchlist(null)}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Share invite button */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                  Share Watchlist Invite
                </label>
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => handleShareWatchlist(inviteModalWatchlist.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 py-3 text-sm font-semibold text-white border border-white/10 transition-all"
                >
                  {inviteCopied ? <Check className="size-4 text-white" /> : <Share2 className="size-4" />}
                  <span>{inviteCopied ? "Invite Link Copied!" : "Copy Invite Link"}</span>
                </button>
              </div>

              {/* Privacy Toggle */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">
                  Visibility
                </label>
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => handleTogglePrivacy(inviteModalWatchlist)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-900/80 border border-white/10 hover:border-white/20 text-sm font-semibold text-white transition-all"
                >
                  <span className="flex items-center gap-2">
                    {inviteModalWatchlist.privacy === "public" ? (
                      <Globe className="size-4 text-white" />
                    ) : (
                      <Lock className="size-4 text-white/60" />
                    )}
                    <span>{inviteModalWatchlist.privacy === "public" ? "Public Watchlist" : "Private Watchlist"}</span>
                  </span>
                  <span className="text-xs text-white/50">Click to change</span>
                </button>
              </div>

              {/* Delete Watchlist */}
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => handleDeleteWatchlistSubmit(inviteModalWatchlist.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 py-3 text-sm font-semibold text-white/80 border border-white/10 transition-all"
                >
                  <Trash2 className="size-4 text-white/60" />
                  <span>Delete Watchlist</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          VIEW ALL MODAL (Full Grid)
         ───────────────────────────────────────────────────────────────────────────── */}
      {viewAllType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-6"
          onClick={() => {
            setViewAllType(null);
            setViewAllWatchlist(null);
          }}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-black border border-white/20 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {viewAllType === "history"
                    ? "Watch History"
                    : viewAllType === "liked"
                    ? "Liked Titles"
                    : viewAllWatchlist?.name ?? "Watchlist"}
                </h2>
                <p className="text-xs text-white/50">
                  Full list · Tap item to view or click X to remove
                </p>
              </div>
              <button
                onClick={() => {
                  setViewAllType(null);
                  setViewAllWatchlist(null);
                }}
                className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                type="button"
              >
                <X className="size-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {viewAllType === "history" &&
                  history.map((entry) => (
                    <LibraryMediaCard
                      key={`vahistory-${entry.id}`}
                      title={entry.title}
                      posterPath={entry.poster_path}
                      subtitle={formatProgress(entry.progress_seconds)}
                      onClick={() =>
                        router.push(
                          watchHref(
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
                            { season: entry.season_number, episode: entry.episode_number }
                          )
                        )
                      }
                      onRemove={() =>
                        handleRemoveHistory(entry.media_id, entry.media_type as MediaType)
                      }
                    />
                  ))}

                {viewAllType === "liked" &&
                  liked.map((entry) => (
                    <LibraryMediaCard
                      key={`valiked-${entry.id}`}
                      title={entry.title}
                      posterPath={entry.poster_path}
                      subtitle={entry.year || undefined}
                      rating={entry.vote_average}
                      onClick={() =>
                        openDetail({
                          id: entry.media_id,
                          mediaType: entry.media_type as MediaType,
                          title: entry.title,
                        })
                      }
                      onRemove={() =>
                        handleRemoveLiked(entry.media_id, entry.media_type as MediaType)
                      }
                    />
                  ))}

                {viewAllType === "watchlist" &&
                  viewAllWatchlist &&
                  (watchlistItemsMap[viewAllWatchlist.id] ?? []).map((item) => (
                    <LibraryMediaCard
                      key={`vawitem-${item.id}`}
                      title={item.title}
                      posterPath={item.poster_path}
                      subtitle={item.year || undefined}
                      rating={item.vote_average}
                      onClick={() =>
                        openDetail({
                          id: item.media_id,
                          mediaType: item.media_type as MediaType,
                          title: item.title,
                        })
                      }
                      onRemove={() =>
                        handleRemoveWatchlistItem(
                          viewAllWatchlist.id,
                          item.media_id,
                          item.media_type as MediaType
                        )
                      }
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}


    </main>
  );
}
