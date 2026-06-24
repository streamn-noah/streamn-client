import { WatchHeader } from "@/components/streamn/watch-header";
import { WatchPlayer } from "@/components/streamn/watch-player";
import { type MediaSummary, type MediaType } from "@/lib/media";
import { getMediaDetail } from "@/lib/tmdb";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: MediaType; id: string }>;
  searchParams: Promise<{ s?: string; e?: string }>;
}) {
  const { type, id } = await params;
  const { s, e } = await searchParams;
  const numericId = Number(id);
  const season = Number(s ?? 1);
  const episode = Number(e ?? 1);

  const validType = type === "movie" || type === "tv";
  let detail = null;

  if (validType && Number.isFinite(numericId)) {
    try {
      detail = await getMediaDetail(type, numericId);
    } catch {
      detail = null;
    }
  }

  const item: MediaSummary =
    detail ??
    ({
      id: numericId,
      mediaType: type,
      title: "Untitled",
      subtitle: type === "movie" ? "Movie" : "Series",
      overview: "",
      posterPath: null,
      backdropPath: null,
      voteAverage: 0,
      year: "",
      genreIds: [],
    } satisfies MediaSummary);

  return (
    <main className='min-h-screen bg-black text-white'>
      <div className='flex h-screen flex-col'>
        <WatchHeader
          mediaId={numericId}
          mediaType={type}
          title={detail?.title}
        />
        {validType && Number.isFinite(numericId) ? (
          <WatchPlayer
            episode={episode}
            item={item}
            mediaId={numericId}
            mediaType={type}
            season={season}
          />
        ) : (
          <div className='grid flex-1 place-items-center text-white/60'>
            This watch link is invalid.
          </div>
        )}
      </div>
    </main>
  );
}
