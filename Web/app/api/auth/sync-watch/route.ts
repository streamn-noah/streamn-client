import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import type { MediaType } from "@/lib/media";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    item,
    progressSeconds,
    seasonNumber = 1,
    episodeNumber = 1,
  } = body as {
    item: {
      id: number;
      mediaType: MediaType;
      title: string;
      posterPath?: string | null;
      backdropPath?: string | null;
    };
    progressSeconds: number;
    seasonNumber?: number;
    episodeNumber?: number;
  };

  if (!item?.id || !item?.mediaType) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabase.from("watch_history").upsert(
    {
      user_id: user.id,
      media_id: item.id,
      media_type: item.mediaType,
      title: item.title,
      poster_path: item.posterPath ?? null,
      backdrop_path: item.backdropPath ?? null,
      progress_seconds: Math.floor(progressSeconds),
      season_number: seasonNumber,
      episode_number: episodeNumber,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,media_id,media_type" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
