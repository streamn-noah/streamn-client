import { NextResponse } from "next/server";
import { getMovieBoxStreams } from "@/lib/moviebox";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const type = (searchParams.get("type") || "movie") as "movie" | "tv";
  const season = Number(searchParams.get("season") ?? "1");
  const episode = Number(searchParams.get("episode") ?? "1");

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const data = await getMovieBoxStreams({
      title,
      type,
      season: isNaN(season) ? 1 : season,
      episode: isNaN(episode) ? 1 : episode,
    });

    if (!data) {
      return NextResponse.json({ error: "No stream sources found on MovieBox" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("MovieBox API Route Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
