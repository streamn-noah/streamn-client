import { watchProviders, getByProvider } from "@/lib/tmdb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const provider = watchProviders.find((entry) => entry.slug === slug);

  if (!provider) {
    return Response.json({ error: "Unknown provider." }, { status: 400 });
  }

  try {
    const [movieItems, tvItems] = await Promise.all([
      getByProvider("movie", provider.id).catch(() => []),
      getByProvider("tv", provider.id).catch(() => []),
    ]);

    const seen = new Set<string>();
    const results = [...movieItems, ...tvItems].filter((item) => {
      const key = `${item.mediaType}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load provider row." },
      { status: 500 },
    );
  }
}
