import type { MediaType } from "@/lib/media";
import { getMediaDetail } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as MediaType | null;
  const id = Number(url.searchParams.get("id"));

  if ((type !== "movie" && type !== "tv") || !Number.isFinite(id)) {
    return Response.json({ error: "Invalid media type or id." }, { status: 400 });
  }

  try {
    const detail = await getMediaDetail(type, id);
    return Response.json(detail);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load details." },
      { status: 500 },
    );
  }
}
