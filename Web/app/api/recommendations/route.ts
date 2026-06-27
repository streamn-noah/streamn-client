import type { MediaType } from "@/lib/media";
import { getRecommendations } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as MediaType | null;
  const id = Number(url.searchParams.get("id"));

  if ((type !== "movie" && type !== "tv") || !Number.isFinite(id)) {
    return Response.json({ error: "Invalid media reference." }, { status: 400 });
  }

  try {
    const results = await getRecommendations(type, id);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load recommendations." },
      { status: 500 },
    );
  }
}
