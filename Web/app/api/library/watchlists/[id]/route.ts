import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*), profiles(display_name)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }

  return NextResponse.json({ watchlist: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, privacy } = body as {
    name?: string;
    description?: string;
    privacy?: "public" | "private";
  };

  const { data, error } = await supabase
    .from("watchlists")
    .update({
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description.trim() || null } : {}),
      ...(privacy !== undefined ? { privacy } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ watchlist: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
