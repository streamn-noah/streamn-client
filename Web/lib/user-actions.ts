import { createClient } from "@/lib/supabase";
import type { MediaSummary } from "@/lib/media";
import type { Database, Json, TasteProfile } from "@/lib/supabase-types";

type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];
type LikedMediaRow = Database["public"]["Tables"]["liked_media"]["Row"];
type WatchHistoryRow = Database["public"]["Tables"]["watch_history"]["Row"];

// ─────────────────────────────────────────────────────────────────────────────
// LIKES
// ─────────────────────────────────────────────────────────────────────────────

export async function likeMedia(
  item: MediaSummary,
  genres: string[] = [],
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("liked_media").upsert(
    {
      user_id: user.id,
      media_id: item.id,
      media_type: item.mediaType,
      title: item.title,
      poster_path: item.posterPath,
      backdrop_path: item.backdropPath,
      overview: item.overview,
      year: item.year,
      vote_average: item.voteAverage,
      genres,
      genre_ids: item.genreIds ?? [],
    },
    { onConflict: "user_id,media_id,media_type" },
  );
  return !error;
}

export async function unlikeMedia(
  mediaId: number,
  mediaType: "movie" | "tv",
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("liked_media")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);
  return !error;
}

export async function getLikedIds(): Promise<
  { media_id: number; media_type: string }[]
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("liked_media")
    .select("media_id, media_type")
    .eq("user_id", user.id);
  return data ?? [];
}

export async function getLikedMedia(): Promise<LikedMediaRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("liked_media")
    .select("*")
    .eq("user_id", user.id)
    .order("liked_at", { ascending: false });
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// WATCH HISTORY
// ─────────────────────────────────────────────────────────────────────────────

export async function syncWatchSession({
  item,
  progressSeconds,
  seasonNumber,
  episodeNumber,
}: {
  item: MediaSummary;
  progressSeconds: number;
  seasonNumber: number;
  episodeNumber: number;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("watch_history").upsert(
    {
      user_id: user.id,
      media_id: item.id,
      media_type: item.mediaType,
      title: item.title,
      poster_path: item.posterPath,
      backdrop_path: item.backdropPath,
      progress_seconds: Math.floor(progressSeconds),
      season_number: seasonNumber,
      episode_number: episodeNumber,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,media_id,media_type" },
  );
}

export async function getWatchHistory(): Promise<WatchHistoryRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("watch_history")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function removeFromWatchHistory(
  mediaId: number,
  mediaType: "movie" | "tv",
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("watch_history")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);
  return !error;
}

// ─────────────────────────────────────────────────────────────────────────────
// WATCHLISTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createWatchlist(
  name: string,
  privacy: "public" | "private" = "private",
  description?: string,
): Promise<WatchlistRow | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("watchlists")
    .insert({ user_id: user.id, name, privacy, description })
    .select()
    .single();

  if (error) {
    console.error("Error creating watchlist:", error);
    return null;
  }
  return data;
}

export async function getWatchlist(watchlistId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*)")
    .eq("id", watchlistId)
    .single();

  if (error) {
    console.error("Error in getWatchlist:", error);
    return null;
  }

  if (data && data.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", data.user_id)
      .single();
      
    return { ...data, profiles: profile };
  }

  return data;
}

export async function getMyWatchlists(): Promise<WatchlistRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function isAddedToAnyWatchlist(
  mediaId: number,
  mediaType: "movie" | "tv",
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("watchlist_items")
    .select("id, watchlists!inner(user_id)")
    .eq("media_id", mediaId)
    .eq("media_type", mediaType)
    .eq("watchlists.user_id", user.id)
    .limit(1);

  return (data && data.length > 0) || false;
}

export async function getPublicWatchlists() {
  const supabase = createClient();
  const { data } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*)")
    .eq("privacy", "public")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!data) return [];

  // Fetch profiles manually
  const withProfiles = await Promise.all(
    data.map(async (list) => {
      if (list.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", list.user_id)
          .single();
        return { ...list, profiles: profile };
      }
      return list;
    })
  );

  return withProfiles;
}

export async function getWatchlistItems(
  watchlistId: string,
): Promise<WatchlistItemRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("watchlist_id", watchlistId)
    .order("added_at", { ascending: false });
  return data ?? [];
}

export async function addToWatchlist(
  watchlistId: string,
  item: MediaSummary,
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("watchlist_items").upsert(
    {
      watchlist_id: watchlistId,
      media_id: item.id,
      media_type: item.mediaType,
      title: item.title,
      poster_path: item.posterPath,
      backdrop_path: item.backdropPath,
      year: item.year,
      vote_average: item.voteAverage,
    },
    { onConflict: "watchlist_id,media_id,media_type" },
  );
  return !error;
}

export async function removeFromWatchlist(
  watchlistId: string,
  mediaId: number,
  mediaType: "movie" | "tv",
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("watchlist_id", watchlistId)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);
  return !error;
}

export async function updateWatchlist(
  watchlistId: string,
  updates: { name?: string; description?: string; privacy?: "public" | "private" },
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("watchlists")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", watchlistId);
  return !error;
}

export async function deleteWatchlist(watchlistId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", watchlistId);
  return !error;
}



export async function addPublicWatchlistToLibrary(
  watchlistId: string,
): Promise<WatchlistRow | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Copy the watchlist and its items
  const { data: original } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*)")
    .eq("id", watchlistId)
    .single();

  if (!original) return null;

  const newList = await createWatchlist(
    `${(original as unknown as WatchlistRow & { watchlist_items: WatchlistItemRow[] }).name} (saved)`,
    "private",
    (original as unknown as WatchlistRow).description ?? undefined,
  );
  if (!newList) return null;

  const items = (original as unknown as WatchlistRow & { watchlist_items: WatchlistItemRow[] }).watchlist_items ?? [];
  if (items.length > 0) {
    await supabase.from("watchlist_items").insert(
      items.map((item: WatchlistItemRow) => ({
        watchlist_id: newList.id,
        media_id: item.media_id,
        media_type: item.media_type,
        title: item.title,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        year: item.year,
        vote_average: item.vote_average,
      })),
    );
  }

  return newList;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVITES
// ─────────────────────────────────────────────────────────────────────────────

export async function createInviteLink(watchlistId: string): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("watchlist_invites")
    .insert({ watchlist_id: watchlistId, created_by: user.id })
    .select()
    .single();

  if (error || !data) return null;
  return `${window.location.origin}/invite/${data.id}`;
}

export async function getInvite(inviteId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("watchlist_invites")
    .select("*, watchlists(*, watchlist_items(*))")
    .eq("id", inviteId)
    .gt("expires_at", new Date().toISOString())
    .single();
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE / ONBOARDING
// ─────────────────────────────────────────────────────────────────────────────

export async function saveOnboardingData(data: TasteProfile): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("profiles").update({
    taste_profile: data as unknown as Json,
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);

  return !error;
}
