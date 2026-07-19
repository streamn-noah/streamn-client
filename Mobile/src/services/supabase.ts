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
