import type { MediaType } from "@/lib/media";
import { discoverByGenre } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as MediaType | null;
  const genre = Number(url.searchParams.get("genre"));

  if ((type !== "movie" && type !== "tv") || !Number.isFinite(genre)) {
    return Response.json({ error: "Invalid genre request." }, { status: 400 });
  }

  try {
    const results = await discoverByGenre(type, genre);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load genre picks." },
      { status: 500 },
    );
  }
}
