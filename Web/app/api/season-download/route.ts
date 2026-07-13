import { NextResponse } from "next/server";
import { getMovieBoxSeasonDownloadSources } from "@/lib/moviebox";
import { getMediaDetail } from "@/lib/tmdb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "tv";
  const id = searchParams.get("id");
  const season = searchParams.get("season") ?? "1";

  if (!id || isNaN(Number(id)) || type !== "tv") {
    return NextResponse.json(
      { error: "Invalid or missing parameters. Only TV shows are supported." },
      { status: 400 }
    );
  }

  try {
    const detail = await getMediaDetail("tv", Number(id));
    const mediaTitle = detail?.title;
    const mediaYear = detail?.year;

    if (mediaTitle) {
      const movieboxData = await getMovieBoxSeasonDownloadSources({
        title: mediaTitle,
        type: "tv",
        year: mediaYear,
        season: Number(season),
      });

      if (movieboxData && movieboxData.episodes && movieboxData.episodes.length > 0) {
        const episodes = movieboxData.episodes.map(ep => {
          const sources = ep.streams.map((stream) => ({
            url: stream.url,
            quality: stream.quality,
            type: stream.format || "mp4",
            provider: { id: "moviebox", name: "MovieBox" },
            size: stream.size,
            duration: stream.duration,
          }));
          return {
            episode: ep.episode,
            sources,
          };
        });

        return NextResponse.json(
          {
            responseId: movieboxData.subjectId,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
            episodes,
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
            },
          }
        );
      }
    }
  } catch (error) {
    console.error("Failed to fetch season downloads:", error);
  }

  return NextResponse.json(
    { episodes: [], error: "No season download sources available" },
    { status: 200 }
  );
}
