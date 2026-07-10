import { NextResponse } from "next/server";
import { getMovieBoxDownloadSources, getMovieBoxStreams } from "@/lib/moviebox";
import { getMediaDetail } from "@/lib/tmdb";

const BACKEND_URLS = [
  process.env.BACKEND_URL,
  "http://localhost:3001",
  "https://streamn-backend.fly.dev",
].filter(Boolean) as string[];

async function fetchFromBackend(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    clearTimeout(timeoutId);
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "movie";
  const id = searchParams.get("id");
  const season = searchParams.get("season") ?? "1";
  const episode = searchParams.get("episode") ?? "1";
  const mode = searchParams.get("mode") === "download" ? "download" : "playback";

  if (!id || isNaN(Number(id))) {
    return NextResponse.json(
      { error: "Invalid or missing media id" },
      { status: 400 }
    );
  }

  // 1. Try MovieBox default streaming source first
  try {
    // Resolve the media title from TMDB so MovieBox can search by keyword
    const detail = await getMediaDetail(type as "movie" | "tv", Number(id));
    const mediaTitle = detail?.title;
    const mediaYear = detail?.year;

    if (mediaTitle) {
      const movieboxData =
        mode === "download"
          ? await getMovieBoxDownloadSources({
              title: mediaTitle,
              type: type as "movie" | "tv",
              year: mediaYear,
              season: Number(season),
              episode: Number(episode),
            })
          : await getMovieBoxStreams({
              title: mediaTitle,
              type: type as "movie" | "tv",
              year: mediaYear,
              season: Number(season),
              episode: Number(episode),
            });

      if (movieboxData && movieboxData.streams && movieboxData.streams.length > 0) {
        const sortedStreams = [...movieboxData.streams].sort(
          (a, b) => (b.resolution || 0) - (a.resolution || 0)
        );
        const selectedStreams =
          mode === "download" ? sortedStreams : sortedStreams.slice(0, 1);

        const sources = selectedStreams.map((stream) => ({
          url: stream.url,
          quality: stream.quality,
          type: stream.format || "mp4",
          provider: { id: "moviebox", name: "MovieBox" },
          size: stream.size,
          duration: stream.duration,
        }));

        // Collect all subtitles/captions across streams without duplicates
        const subtitles: Array<{ url: string; format: string; label: string }> = [];
        const seenSubUrls = new Set<string>();
        for (const stream of sortedStreams) {
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

        return NextResponse.json(
          {
            responseId: movieboxData.subjectId,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
            sources,
            subtitles,
          },
          {
            status: 200,
            headers: {
              // Never cache — signed URLs have a short expiry window
              "Cache-Control": "no-store",
            },
          }
        );
      }
    }
  } catch (error) {
    console.error("Failed to fetch from default MovieBox source, falling back:", error);
  }

  // 2. Fallback to existing HLS backends
  const path =
    type === "movie"
      ? `/v1/movies/${id}`
      : `/v1/tv/${id}/seasons/${season}/episodes/${episode}`;

  for (const baseUrl of BACKEND_URLS) {
    const data = await fetchFromBackend(`${baseUrl}${path}`, 8000);
    if (data && Array.isArray(data.sources) && data.sources.length > 0) {
      return NextResponse.json(
        {
          responseId: data.responseId,
          expiresAt: data.expiresAt,
          sources: data.sources,
          subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
          diagnostics: data.diagnostics || [],
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }
  }

  return NextResponse.json(
    { sources: [], subtitles: [], error: "No stream sources available" },
    { status: 200 }
  );
}
