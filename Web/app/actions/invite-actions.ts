"use server";

import { createAdminClient } from "@/lib/supabase-admin";

export async function getInviteAdmin(inviteId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("watchlist_invites")
    .select("*, watchlists(*, watchlist_items(*))")
    .eq("id", inviteId)
    .gt("expires_at", new Date().toISOString())
    .single();
    
  return data;
}
