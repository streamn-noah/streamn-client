"use client";

import Image from "next/image";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { Database } from "@/lib/supabase-types";
import { tmdbImage } from "@/lib/media";
import { addPublicWatchlistToLibrary } from "@/lib/user-actions";

type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"] & {
  profiles?: { display_name: string | null } | null;
  watchlist_items?: Database["public"]["Tables"]["watchlist_items"]["Row"][];
};

export function PublicWatchlistModal({
  watchlistId,
  onClose,
}: {
  watchlistId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!watchlistId) {
      setWatchlist(null);
      return;
    }

    setLoading(true);
    fetch(`/api/library/watchlists/${watchlistId}`)
      .then((response) => response.json())
      .then((payload) => setWatchlist(payload.watchlist ?? null))
      .finally(() => setLoading(false));
  }, [watchlistId]);

  if (!watchlistId) return null;

  async function handleAddToLibrary() {
    if (!user) {
      router.push("/auth");
      return;
    }
    setSaving(true);
    const result = await addPublicWatchlistToLibrary(watchlistId!);
    setSaving(false);
    if (result) setSaved(true);
  }

  const items = watchlist?.watchlist_items ?? [];

  return (
    <div className='watchlist-detail-overlay' onClick={onClose} role='presentation'>
      <div
        className='watchlist-detail-panel public-watchlist-modal'
        onClick={(event) => event.stopPropagation()}
        role='dialog'
      >
        <div className='watchlist-detail-header'>
          <div>
            <p className='text-xs font-bold uppercase tracking-wider text-white/40'>
              Public watchlist
            </p>
            <h2 className='text-2xl font-black'>{watchlist?.name ?? "Loading..."}</h2>
            {watchlist?.profiles?.display_name ? (
              <p className='mt-1 text-sm text-white/55'>
                by {watchlist.profiles.display_name}
              </p>
            ) : null}
          </div>
          <button
            aria-label='Close'
            className='ghost-button !px-3 !py-3'
            onClick={onClose}
            type='button'
          >
            <X className='size-5' />
          </button>
        </div>

        {watchlist?.description ? (
          <p className='mb-4 text-sm leading-6 text-white/60'>
            {watchlist.description}
          </p>
        ) : null}

        {loading ? (
          <div className='flex min-h-40 items-center justify-center'>
            <Loader2 className='size-6 animate-spin text-white/40' />
          </div>
        ) : (
          <div className='library-grid public-watchlist-grid'>
            {items.map((item) => (
              <div className='library-media-card' key={item.id}>
                <Image
                  src={tmdbImage(item.poster_path, "w342")}
                  alt={item.title}
                  fill
                  sizes='140px'
                  className='object-cover'
                />
                <span className='library-card-overlay'>
                  <span className='block truncate text-sm font-bold'>
                    {item.title}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          className='auth-cta-button mt-6 w-full'
          disabled={saving || saved || loading}
          onClick={handleAddToLibrary}
          type='button'
        >
          {saved ? (
            <>
              <Check className='size-5' />
              Added to your library
            </>
          ) : saving ? (
            <Loader2 className='size-5 animate-spin' />
          ) : (
            <>
              <Plus className='size-5' />
              Add to my library
            </>
          )}
        </button>
      </div>
    </div>
  );
}
