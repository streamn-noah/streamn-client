import { GoogleGenAI } from "@google/genai";
import { fallbackPlan } from "@/lib/tmdb";
import type { SearchPlan } from "@/lib/media";

let client: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  return client;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1] ?? trimmed;
}

export async function createSearchPlan(prompt: string): Promise<SearchPlan> {
  const fallback = fallbackPlan(prompt);

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Convert this streaming search request into JSON for TMDB discovery.

User request: ${prompt}

Return only JSON with this shape:
{
  "label": "short natural label",
  "searchTerms": ["up to 3 movie or show title-like queries"],
  "genreIds": [TMDB movie genre ids],
  "mediaType": "movie" | "tv" | "all"
}

Use TMDB movie genre ids: action 28, adventure 12, animation 16, comedy 35, crime 80, documentary 99, drama 18, family 10751, fantasy 14, history 36, horror 27, music 10402, mystery 9648, romance 10749, science fiction 878, thriller 53, war 10752, western 37.`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(extractJson(response.text ?? "")) as Partial<SearchPlan>;

    return {
      label: parsed.label || fallback.label,
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms.filter(Boolean).slice(0, 3) : fallback.searchTerms,
      genreIds: Array.isArray(parsed.genreIds)
        ? parsed.genreIds.filter((id): id is number => Number.isFinite(id)).slice(0, 4)
        : fallback.genreIds,
      mediaType: parsed.mediaType === "movie" || parsed.mediaType === "tv" || parsed.mediaType === "all" ? parsed.mediaType : fallback.mediaType,
    };
  } catch {
    return fallback;
  }
}
