import { SearchPlan } from './media';
import { fallbackPlan } from './tmdb';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function createSearchPlan(prompt: string): Promise<SearchPlan> {
  const fallback = fallbackPlan(prompt);
  if (!GEMINI_API_KEY) {
    console.warn("Missing EXPO_PUBLIC_GEMINI_API_KEY. Using local fallback search plan.");
    return fallback;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Convert this streaming search request into JSON for TMDB discovery.

User request: ${prompt}

Return only JSON with this shape:
{
  "label": "short natural label explaining why these matches are selected (e.g. 'If you're craving more of the eerie and enigmatic, these picks might satisfy.')",
  "searchTerms": ["up to 3 movie or show title-like queries"],
  "genreIds": [TMDB movie genre ids],
  "mediaType": "movie" | "tv" | "all"
}

Use TMDB movie genre ids: action 28, adventure 12, animation 16, comedy 35, crime 80, documentary 99, drama 18, family 10751, fantasy 14, history 36, horror 27, music 10402, mystery 9648, romance 10749, science fiction 878, thriller 53, war 10752, western 37.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(extractJson(text)) as Partial<SearchPlan>;

    return {
      label: parsed.label || fallback.label,
      searchTerms: Array.isArray(parsed.searchTerms)
        ? parsed.searchTerms.filter(Boolean).slice(0, 3)
        : fallback.searchTerms,
      genreIds: Array.isArray(parsed.genreIds)
        ? parsed.genreIds.filter((id: any): id is number => Number.isFinite(id)).slice(0, 4)
        : fallback.genreIds,
      mediaType:
        parsed.mediaType === "movie" || parsed.mediaType === "tv" || parsed.mediaType === "all"
          ? parsed.mediaType
          : fallback.mediaType,
    };
  } catch (err) {
    console.error("Gemini search plan creation failed:", err);
    return fallback;
  }
}
