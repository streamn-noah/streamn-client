import { SearchPlan } from './media';
import { fallbackPlan } from './tmdb';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

function parseGeminiJson(text: string): Partial<SearchPlan> | null {
  if (!text) return null;
  let raw = text.trim();

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    raw = fenced[1].trim();
  }

  // Attempt 1: Direct JSON parse
  try {
    return JSON.parse(raw);
  } catch { }

  // Attempt 2: Extract starting from the first '{'
  const firstBrace = raw.indexOf("{");
  if (firstBrace === -1) return null;

  const sub = raw.substring(firstBrace);
  try {
    return JSON.parse(sub);
  } catch { }

  // Attempt 3: Shrink from last '}' backwards to find matching JSON boundary
  let lastBrace = sub.lastIndexOf("}");
  while (lastBrace > 0) {
    const candidate = sub.substring(0, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      lastBrace = sub.lastIndexOf("}", lastBrace - 1);
    }
  }

  // Attempt 4: Auto-repair truncated JSON (missing closing braces/brackets/quotes)
  let repaired = sub.trim().replace(/,\s*$/, "");
  const stack: string[] = [];
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    if (inString) {
      if (char === "\\" && !isEscaped) {
        isEscaped = true;
      } else {
        if (char === '"' && !isEscaped) {
          inString = false;
        }
        isEscaped = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  if (inString) {
    repaired += '"';
  }
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  try {
    return JSON.parse(repaired);
  } catch { }

  return null;
}

export async function createSearchPlan(prompt: string): Promise<SearchPlan> {
  const fallback = fallbackPlan(prompt);
  if (!GEMINI_API_KEY) {
    console.warn("Missing EXPO_PUBLIC_GEMINI_API_KEY. Using local fallback search plan.");
    return fallback;
  }

  try {
    const fetchWithModel = async (model: string) => {
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
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
  "label": "short concise label (max 10 words) explaining why these matches were picked",
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
              maxOutputTokens: 1024,
            },
          }),
        }
      );
    };

    const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
    let response: Response | null = null;

    for (const model of modelsToTry) {
      try {
        const res = await fetchWithModel(model);
        if (res.ok) {
          response = res;
          break;
        }
      } catch {
        // try next model in list
      }
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text().catch(() => "") : "Network error or all models failed";
      console.warn(`Gemini API request failed: ${errorText}`);
      return fallback;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!text.trim()) {
      console.warn("Gemini response candidate text is empty. Falling back.");
      return fallback;
    }

    const parsed = parseGeminiJson(text);
    if (!parsed) {
      console.warn("Could not parse JSON from Gemini response. Raw text:", text);
      return fallback;
    }

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
