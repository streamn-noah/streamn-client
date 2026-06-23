import { createSearchPlan } from "@/lib/gemini";
import { roulettePick } from "@/lib/tmdb";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  const prompt = body.prompt?.trim() || "popular movies";

  try {
    const plan = await createSearchPlan(prompt);
    const pick = await roulettePick(plan);
    return Response.json({ label: plan.label, result: pick });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Roulette failed." },
      { status: 500 },
    );
  }
}
