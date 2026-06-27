import { createSearchPlan } from "@/lib/gemini";
import { rouletteQueue } from "@/lib/tmdb";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  const prompt = body.prompt?.trim() || "popular movies";

  try {
    const plan = await createSearchPlan(prompt);
    const results = await rouletteQueue(plan, 12);
    return Response.json({ label: plan.label, results, result: results[0] });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Roulette failed." },
      { status: 500 },
    );
  }
}
