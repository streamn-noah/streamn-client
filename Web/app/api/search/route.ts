import { createSearchPlan } from "@/lib/gemini";
import { searchByTitle, searchWithPlan, getTrending } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const mode = url.searchParams.get("mode") ?? "title";

  if (!query && mode !== "trending") {
    return Response.json({ label: "Start with a title or vibe", results: [] });
  }

  try {
    if (mode === "trending") {
      const results = await getTrending("all", "week");
      return Response.json({ label: "Trending in Nigeria", results });
    }

    if (mode === "ai") {
      const plan = await createSearchPlan(query);
      const results = await searchWithPlan(plan);
      return Response.json({ label: plan.label, results });
    }

    const results = await searchByTitle(query);
    return Response.json({ label: `${results.length} results for "${query}"`, results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed", results: [] },
      { status: 500 },
    );
  }
}
