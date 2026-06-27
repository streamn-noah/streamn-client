import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import type { Json } from "@/lib/supabase-types";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { display_name, avatar_url, taste_profile, onboarding_complete } = body as {
    display_name?: string;
    avatar_url?: string | null;
    taste_profile?: Json;
    onboarding_complete?: boolean;
  };

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(display_name !== undefined ? { display_name: display_name.trim() || null } : {}),
      ...(avatar_url !== undefined ? { avatar_url } : {}),
      ...(taste_profile !== undefined ? { taste_profile } : {}),
      ...(onboarding_complete !== undefined ? { onboarding_complete } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
