import { getSeasonEpisodes } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tvId = Number(url.searchParams.get("tvId"));
  const season = Number(url.searchParams.get("season"));

  if (!Number.isFinite(tvId) || !Number.isFinite(season) || season < 1) {
    return Response.json({ error: "Invalid TV id or season number." }, { status: 400 });
  }

  try {
    const episodes = await getSeasonEpisodes(tvId, season);
    return Response.json({ episodes });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load season." },
      { status: 500 },
    );
  }
}
