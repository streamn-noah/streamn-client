import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { watchlistId, action, inviteId } = body as {
    watchlistId?: string;
    action: "create" | "accept" | "decline";
    inviteId?: string;
  };

  if (action === "create") {
    if (!watchlistId) {
      return NextResponse.json({ error: "watchlistId required" }, { status: 400 });
    }

    const { data: owned } = await supabase
      .from("watchlists")
      .select("id")
      .eq("id", watchlistId)
      .eq("user_id", user.id)
      .single();

    if (!owned) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("watchlist_invites")
      .insert({ watchlist_id: watchlistId, created_by: user.id })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invite: data });
  }

  if (action === "accept" && inviteId) {
    const adminClient = createAdminClient();
    const { data: invite } = await adminClient
      .from("watchlist_invites")
      .select("*, watchlists(*, watchlist_items(*))")
      .eq("id", inviteId)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!invite) {
      return NextResponse.json({ error: "Invite expired or not found" }, { status: 404 });
    }

    const original = invite.watchlists as {
      name: string;
      description: string | null;
      watchlist_items: Array<{
        media_id: number;
        media_type: "movie" | "tv";
        title: string;
        poster_path: string | null;
        backdrop_path: string | null;
        year: string | null;
        vote_average: number | null;
      }>;
    };

    const { data: newList, error: listError } = await adminClient
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
      return NextResponse.json({ error: listError?.message ?? "Failed" }, { status: 500 });
    }

    const items = original.watchlist_items ?? [];
    if (items.length) {
      await adminClient.from("watchlist_items").insert(
        items.map((item) => ({
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

    return NextResponse.json({ watchlist: newList });
  }

  return NextResponse.json({ ok: true });
}
