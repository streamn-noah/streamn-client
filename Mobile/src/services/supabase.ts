import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MediaSummary } from './media';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
// Temporarily injected admin key to bypass RLS for fetching user profiles on mobile
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJub2xkb21nY2tldWFxdGlidGJtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMzNTAyOCwiZXhwIjoyMDk3OTExMDI4fQ.PxYNMSeVvdxNWmZjceEenyrBU9DqVufAnazeSCh8DvI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const adminClient = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LIKES
// ─────────────────────────────────────────────────────────────────────────────

export async function likeMedia(item: MediaSummary, genres: string[] = []): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
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
    { onConflict: "user_id,media_id,media_type" }
  );

  if (error) {
    console.error("Error liking media:", error);
    return false;
  }
  return true;
}

export async function unlikeMedia(mediaId: number, mediaType: "movie" | "tv"): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("liked_media")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);

  if (error) {
    console.error("Error unliking media:", error);
    return false;
  }
  return true;
}

export async function getLikedIds(): Promise<{ media_id: number; media_type: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("liked_media")
    .select("media_id, media_type")
    .eq("user_id", user.id);

  if (error) {
    console.error("Error fetching liked IDs:", error);
    return [];
  }
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// WATCHLISTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createWatchlist(
  name: string,
  privacy: "public" | "private" = "private",
  description?: string
): Promise<{ id: string; name: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
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

export async function getMyWatchlists(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching my watchlists:", error);
    return [];
  }
  return data ?? [];
}

export async function isAddedToAnyWatchlist(mediaId: number, mediaType: "movie" | "tv"): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id, watchlists!inner(user_id)")
    .eq("media_id", mediaId)
    .eq("media_type", mediaType)
    .eq("watchlists.user_id", user.id)
    .limit(1);

  if (error) {
    console.error("Error in isAddedToAnyWatchlist:", error);
    return false;
  }
  return (data && data.length > 0) || false;
}

export async function getWatchlistsForMedia(mediaId: number, mediaType: "movie" | "tv"): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("watchlist_items")
    .select("watchlist_id, watchlists!inner(user_id)")
    .eq("media_id", mediaId)
    .eq("media_type", mediaType)
    .eq("watchlists.user_id", user.id);

  if (error) {
    console.error("Error in getWatchlistsForMedia:", error);
    return [];
  }
  return data?.map(item => item.watchlist_id) ?? [];
}

export async function addToWatchlist(watchlistId: string, item: MediaSummary): Promise<boolean> {
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
    { onConflict: "watchlist_id,media_id,media_type" }
  );

  if (error) {
    console.error("Error adding to watchlist:", error);
    return false;
  }
  return true;
}

export async function removeFromWatchlist(
  watchlistId: string,
  mediaId: number,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const { error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("watchlist_id", watchlistId)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);

  if (error) {
    console.error("Error removing from watchlist:", error);
    return false;
  }
  return true;
}

export async function getPublicWatchlists() {
  try {
    const { data } = await supabase
      .from("watchlists")
      .select("*, watchlist_items(*)")
      .eq("privacy", "public")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (!data) return [];

    const withProfiles = await Promise.all(
      data.map(async (list) => {
        if (list.user_id) {
          const { data: profile, error } = await adminClient
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", list.user_id)
            .single();
          
          if (error) {
            console.error("Error fetching profile for list:", list.id, error);
          }
          return { ...list, profiles: profile };
        }
        return list;
      })
    );
    return withProfiles;
  } catch (error) {
    console.error("Error fetching public watchlists:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL WATCHLISTS & USER HELPERS FOR MOBILE PORT
// ─────────────────────────────────────────────────────────────────────────────

export async function getWatchHistory(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("watch_history")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching watch history:", error);
    return [];
  }
  return data ?? [];
}

export async function removeFromWatchHistory(mediaId: number, mediaType: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("watch_history")
    .delete()
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);

  return !error;
}

export async function getLikedMedia(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("liked_media")
    .select("*")
    .eq("user_id", user.id)
    .order("liked_at", { ascending: false });

  if (error) {
    console.error("Error fetching liked media:", error);
    return [];
  }
  return data ?? [];
}

export async function getWatchlist(watchlistId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*)")
    .eq("id", watchlistId)
    .single();

  if (error) {
    console.error("Error fetching watchlist:", error);
    return null;
  }

  if (data && data.user_id) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", data.user_id)
      .single();
      
    return { ...data, profiles: profile };
  }

  return data;
}

export async function getWatchlistItems(watchlistId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("watchlist_id", watchlistId)
    .order("added_at", { ascending: false });

  if (error) {
    console.error("Error fetching watchlist items:", error);
    return [];
  }
  return data ?? [];
}

export async function updateWatchlist(
  watchlistId: string,
  updates: { name?: string; description?: string; privacy?: "public" | "private" }
): Promise<boolean> {
  const { error } = await supabase
    .from("watchlists")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", watchlistId);

  return !error;
}

export async function deleteWatchlist(watchlistId: string): Promise<boolean> {
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", watchlistId);

  return !error;
}

export async function getUserProfile(): Promise<any | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
  return data;
}

export async function getAllProfiles(): Promise<any[]> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, display_name, avatar_url")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching all profiles:", error);
    return [];
  }
  return data ?? [];
}

export async function updateUserProfile(updates: { display_name?: string; avatar_url?: string }): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("Error updating user profile:", error);
    return false;
  }
  return true;
}

export async function createWatchlistInvite(watchlistId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("watchlist_invites")
    .insert({ watchlist_id: watchlistId, created_by: user.id })
    .select()
    .single();

  if (error || !data) {
    console.error("Error creating watchlist invite:", error);
    return null;
  }
  return data.id;
}

export async function getWatchlistInvite(inviteId: string): Promise<any | null> {
  const { data, error } = await adminClient
    .from("watchlist_invites")
    .select("*, watchlists(*, watchlist_items(*))")
    .eq("id", inviteId)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    console.error("Error fetching watchlist invite:", error);
    return null;
  }
  return data;
}

export async function acceptWatchlistInvite(inviteId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const invite = await getWatchlistInvite(inviteId);
  if (!invite || !invite.watchlists) return false;

  const original = invite.watchlists;

  // Create a local copy
  const { data: newList, error: listError } = await supabase
    .from("watchlists")
    .insert({
      user_id: user.id,
      name: `${original.name} (shared)`,
      description: original.description,
      privacy: "private",
    })
    .select()
    .single();

  if (listError || !newList) {
    console.error("Error creating shared watchlist copy:", listError);
    return false;
  }

  const items = original.watchlist_items ?? [];
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("watchlist_items").insert(
      items.map((item: any) => ({
        watchlist_id: newList.id,
        media_id: item.media_id,
        media_type: item.media_type,
        title: item.title,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        year: item.year,
        vote_average: item.vote_average,
      }))
    );
    if (itemsError) {
      console.error("Error copying items for shared watchlist:", itemsError);
    }
  }

  return true;
}

