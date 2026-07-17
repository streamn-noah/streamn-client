import { NextResponse } from "next/server";
import { getRecommendations } from "@/lib/tmdb";
import { MediaType } from "@/lib/media";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as MediaType;
  const id = Number(searchParams.get("id"));

  if (!type || !id || isNaN(id)) {
    return NextResponse.json({ error: "Missing or invalid type and id parameters." }, { status: 400 });
  }

  try {
    const results = await getRecommendations(type, id);
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Error fetching recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations." },
      { status: 500 }
    );
  }
}
