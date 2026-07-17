import { NextResponse } from "next/server";
import { searchSubtitles } from "wyzie-lib";

async function fetchWyzieSubtitles(tmdbId: number, type: string, season?: number, episode?: number) {
  try {
    const wyzieKey = process.env.WYZIE_API_KEY;
    if (!wyzieKey) return [];

    const params: any = {
      tmdb_id: tmdbId,
      language: ["en"],
      key: wyzieKey,
    };
    if (type === "tv" && season !== undefined && episode !== undefined) {
      params.season = season;
      params.episode = episode;
    }

    const data = await searchSubtitles(params);

    return (data || []).map((sub: any) => ({
      url: sub.url,
      format: sub.format || "srt",
      label: `Wyzie - ${sub.language || "English"}${sub.origin ? ` (${sub.origin})` : ""}`,
    }));
  } catch (error) {
    console.error("Wyzie subtitles error:", error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "movie";
  const id = searchParams.get("id");
  const season = searchParams.get("season") ?? "1";
  const episode = searchParams.get("episode") ?? "1";

  if (!id || isNaN(Number(id))) {
    return NextResponse.json(
      { error: "Invalid or missing media id" },
      { status: 400 }
    );
  }

  const wyzieSubtitles = await fetchWyzieSubtitles(Number(id), type, Number(season), Number(episode));

  return NextResponse.json(
    { subtitles: wyzieSubtitles },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
