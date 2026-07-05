import { NextResponse } from "next/server";

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

  if (!id || isNaN(Number(id))) {
    return NextResponse.json(
      { error: "Invalid or missing media id" },
      { status: 400 }
    );
  }

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
            "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1200",
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
