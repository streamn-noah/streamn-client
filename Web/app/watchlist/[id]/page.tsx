"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WatchlistDetailView, type WatchlistDetailItem } from "@/components/streamn/watchlist-detail-view";
import { getWatchlist } from "@/lib/user-actions";
import { useAuth } from "@/components/providers/auth-provider";
import { watchHref } from "@/lib/streamn-storage";
import { WatchlistClientActions } from "@/components/streamn/watchlist-client-actions";

export default function WatchlistPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [watchlist, setWatchlist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    getWatchlist(params.id as string)
      .then((data) => {
        if (!data) {
          setError(true);
        } else {
          setWatchlist(data);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (authLoading || loading) {
    return (
      <main className="bg-black min-h-screen text-white flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-white/50" />
      </main>
    );
  }

  if (error || !watchlist) {
    return (
      <main className="bg-black min-h-screen text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-black mb-2">Watchlist Not Found</h1>
        <p className="text-white/50 mb-6 text-center">This watchlist may be private, deleted, or doesn't exist.</p>
        <button
          onClick={() => router.push("/library")}
          className="py-3 px-6 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition-all"
          type="button"
        >
          Go to Library
        </button>
      </main>
    );
  }

  const items = (watchlist.watchlist_items || []) as WatchlistDetailItem[];
  const ownerName = watchlist.profiles?.display_name || "Unknown User";

  const handlePlayFirst = () => {
    if (items.length === 0) return;
    const item = items[0];
    router.push(watchHref({
      id: item.media_id,
      mediaType: item.media_type as any,
      title: item.title,
      posterPath: item.poster_path,
      subtitle: "",
      overview: "",
      backdropPath: null,
      voteAverage: 0,
      year: "",
      genreIds: [],
    }));
  };

  const handleItemClick = (item: WatchlistDetailItem) => {
    router.push(watchHref({
      id: item.media_id,
      mediaType: item.media_type as any,
      title: item.title,
      posterPath: item.poster_path,
      subtitle: "",
      overview: "",
      backdropPath: null,
      voteAverage: 0,
      year: "",
      genreIds: [],
    }));
  };

  return (
    <WatchlistDetailView
      title={watchlist.name}
      description={watchlist.description}
      ownerName={ownerName}
      items={items}
      onPlay={handlePlayFirst}
      onItemClick={handleItemClick}
      secondaryActions={
        user?.id === watchlist.user_id ? (
          <WatchlistClientActions
            watchlist={watchlist}
            ownerProfile={watchlist.profiles}
            existingItems={items}
          />
        ) : null
      }
    />
  );
}
