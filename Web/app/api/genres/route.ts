import { getGenreList } from "@/lib/tmdb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [movieGenres, tvGenres] = await Promise.all([
      getGenreList("movie"),
      getGenreList("tv"),
    ]);
    return NextResponse.json({ movieGenres, tvGenres });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch genres" }, { status: 500 });
  }
}
