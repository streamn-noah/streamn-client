import { getMediaDetail } from "@/lib/tmdb";
import { WatchPartyClient } from "./client";

export const dynamic = "force-dynamic";

export default async function WatchPartyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const roomId = resolvedParams.id;
  const mediaType = resolvedSearchParams.mediaType as "movie" | "tv";
  const mediaIdStr = resolvedSearchParams.mediaId as string;
  const seasonStr = resolvedSearchParams.s as string;
  const episodeStr = resolvedSearchParams.e as string;

  if (!mediaType || !mediaIdStr) {
    return <div className="p-8 text-white">Invalid Watch Party Link</div>;
  }

  const mediaId = parseInt(mediaIdStr, 10);
  const season = seasonStr ? parseInt(seasonStr, 10) : 1;
  const episode = episodeStr ? parseInt(episodeStr, 10) : 1;

  try {
    const detail = await getMediaDetail(mediaType, mediaId);
    
    if (!detail) {
      return <div className="p-8 text-white">Media not found.</div>;
    }

    return (
      <WatchPartyClient 
        roomId={roomId}
        item={detail}
        mediaType={mediaType}
        mediaId={mediaId}
        season={season}
        episode={episode}
      />
    );
  } catch (err) {
    return <div className="p-8 text-white">Failed to load media details for this Watch Party.</div>;
  }
}
