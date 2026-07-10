const INTRO_DB_API_BASE_URL = "https://api.theintrodb.org/v3";

type IntroDbRawSegment = {
  start_ms: number | null;
  end_ms: number | null;
};

type IntroDbRawMediaRecord = {
  intro?: IntroDbRawSegment[];
  recap?: IntroDbRawSegment[];
  credits?: IntroDbRawSegment[];
  preview?: IntroDbRawSegment[];
};

type IntroDbErrorPayload = {
  error?: string;
  details?: string;
  code?: string;
};

function normalizeSegments(segments?: IntroDbRawSegment[]) {
  return (segments ?? []).map((segment) => {
    const startMs = segment.start_ms ?? 0;
    const endMs = segment.end_ms ?? null;

    return {
      startMs,
      endMs,
      durationMs: endMs != null ? Math.max(endMs - startMs, 0) : null,
      startsAtBeginning: segment.start_ms == null,
      endsAtMediaEnd: segment.end_ms == null,
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tmdbId = Number(url.searchParams.get("tmdbId"));
  const seasonParam = url.searchParams.get("season");
  const episodeParam = url.searchParams.get("episode");
  const durationMsParam = url.searchParams.get("durationMs");

  if (!Number.isFinite(tmdbId)) {
    return Response.json({ error: "Invalid TMDB id." }, { status: 400 });
  }

  try {
    const introDbUrl = new URL(`${INTRO_DB_API_BASE_URL}/media`);
    introDbUrl.searchParams.set("tmdb_id", String(tmdbId));

    if (seasonParam) {
      introDbUrl.searchParams.set("season", seasonParam);
    }

    if (episodeParam) {
      introDbUrl.searchParams.set("episode", episodeParam);
    }

    if (durationMsParam) {
      introDbUrl.searchParams.set("duration_ms", durationMsParam);
    }

    const response = await fetch(introDbUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    const payload = (await response.json().catch(() => null)) as (IntroDbRawMediaRecord & IntroDbErrorPayload) | null;

    if (!response.ok) {
      return Response.json(
        {
          error:
            payload?.error ||
            payload?.details ||
            "Could not load IntroDB segments.",
          details: payload?.details,
          code: payload?.code,
        },
        { status: response.status },
      );
    }

    return Response.json({
      intro: normalizeSegments(payload?.intro),
      recap: normalizeSegments(payload?.recap),
      credits: normalizeSegments(payload?.credits),
      preview: normalizeSegments(payload?.preview),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load IntroDB segments.",
      },
      { status: 500 },
    );
  }
}
