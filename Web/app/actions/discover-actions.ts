"use server";

import { createAdminClient } from "@/lib/supabase-admin";

export async function getPublicWatchlistsAdmin() {
  const adminClient = createAdminClient();
  const { data } = await adminClient
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
        const { data: profile } = await adminClient
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
