import { NextResponse } from "next/server";
import { getMovieBoxAllStreams } from "@/lib/moviebox";
import { getMediaDetail } from "@/lib/tmdb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "tv";
  const id = searchParams.get("id");
  const subjectId = searchParams.get("subjectId") || undefined;

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
      const movieboxData = await getMovieBoxAllStreams({
        title: mediaTitle,
        type: "tv",
        year: mediaYear,
        subjectId,
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

          // Collect MovieBox captions
          const subtitles: Array<{ url: string; format: string; label: string }> = [];
          const seenSubUrls = new Set<string>();
          for (const stream of ep.streams) {
            if (Array.isArray(stream.captions)) {
              for (const cap of stream.captions) {
                if (cap.url && !seenSubUrls.has(cap.url)) {
                  seenSubUrls.add(cap.url);
                  subtitles.push({
                    url: cap.url,
                    format: "vtt",
                    label: cap.language || cap.language_code || "English",
                  });
                }
              }
            }
          }

          subtitles.sort((a, b) => {
            const aEnglish = /english|eng/i.test(a.label);
            const bEnglish = /english|eng/i.test(b.label);
            return Number(bEnglish) - Number(aEnglish);
          });

          return {
            season: ep.season,
            episode: ep.episode,
            sources,
            subtitles,
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
            headers: { "Cache-Control": "no-store" },
          }
        );
      }
    }
  } catch (error) {
    console.error("Failed to fetch all streams:", error);
  }

  return NextResponse.json(
    { episodes: [], error: "No stream sources available" },
    { status: 200 }
  );
}
