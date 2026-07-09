const WORKER_URL = process.env.MOVIEBOX_API_URL || "https://spun-moviebox-api-chi.vercel.app";
const WORKER_SECRET = process.env.MOVIEBOX_WORKER_SECRET || "local-secret-12345";

export interface MovieBoxStream {
  quality: string;
  resolution: number;
  url: string;
  format: string;
  size: string;
  codecName?: string;
  duration?: number;
  captions?: Array<{
    language: string;
    language_code: string;
    url: string;
  }>;
  se: number;
  ep: number;
}

export interface MovieBoxResponse {
  title: string;
  subjectId: string;
  streams: MovieBoxStream[];
}

/**
 * Resolves stream links from the MovieBox Worker API.
 *
 * @param title   - The media title to search for (caller should source this from TMDB).
 * @param type    - "movie" or "tv"
 * @param season  - Season number (TV only; automatically converted to 0 for movies).
 * @param episode - Episode number (TV only; automatically converted to 0 for movies).
 */
export async function getMovieBoxStreams(
  title: string,
  type: "movie" | "tv",
  season = 1,
  episode = 1
): Promise<MovieBoxResponse | null> {
  if (!WORKER_URL) {
    console.warn("MOVIEBOX_API_URL environment variable is not defined");
    return null;
  }

  try {
    // 1. Search MovieBox for the title
    const searchRes = await fetch(`${WORKER_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": WORKER_SECRET,
      },
      body: JSON.stringify({ keyword: title, page: 1, perPage: 5 }),
    });

    if (!searchRes.ok) {
      console.error(`MovieBox search failed: ${searchRes.status} ${searchRes.statusText}`);
      return null;
    }

    const searchData = await searchRes.json();
    const items: any[] = searchData.items || [];

    // Prefer a result whose type matches; fall back to the first result
    const match =
      items.find((item) => (type === "movie" ? item.type === "movie" : item.type !== "movie")) ??
      items[0];

    if (!match) {
      console.warn(`No match found on MovieBox for: "${title}"`);
      return null;
    }

    // 2. Fetch stream links — movies use se=0&ep=0 per the API spec
    const querySeason = type === "movie" ? 0 : season;
    const queryEpisode = type === "movie" ? 0 : episode;

    const streamRes = await fetch(
      `${WORKER_URL}/stream/${match.subjectId}?se=${querySeason}&ep=${queryEpisode}&_nocache=${Date.now()}`,
      {
        method: "GET",
        headers: {
          "X-Worker-Secret": WORKER_SECRET,
        },
        cache: "no-store",
      }
    );

    if (!streamRes.ok) {
      console.error(`MovieBox stream fetch failed: ${streamRes.status} ${streamRes.statusText}`);
      return null;
    }

    const streamData = await streamRes.json();
    return {
      title: match.title,
      subjectId: match.subjectId,
      streams: streamData.streams || [],
    };
  } catch (error) {
    console.error("Error in getMovieBoxStreams:", error);
    return null;
  }
}
