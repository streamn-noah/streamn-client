"use client";

import Image from "next/image";
import { Check, Copy, Globe, Loader2, Lock, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase-types";
import { tmdbImage } from "@/lib/media";
import {
  createInviteLink,
  deleteWatchlist,
  getWatchlistItems,
  removeFromWatchlist,
  updateWatchlist,
} from "@/lib/user-actions";

type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"];
type WatchlistItemRow =
  Database["public"]["Tables"]["watchlist_items"]["Row"];

export function WatchlistDetail({
  watchlist,
  onClose,
  onUpdated,
}: {
  watchlist: WatchlistRow;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [items, setItems] = useState<WatchlistItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(watchlist.privacy);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWatchlistItems(watchlist.id).then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [watchlist.id]);

  async function togglePrivacy() {
    const next = privacy === "public" ? "private" : "public";
    setBusy(true);
    const ok = await updateWatchlist(watchlist.id, { privacy: next });
    if (ok) {
      setPrivacy(next);
      onUpdated();
    }
    setBusy(false);
  }

  async function handleShare() {
    setBusy(true);
    const link = await createInviteLink(watchlist.id);
    if (link) {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
    setBusy(false);
  }

  async function handleRemoveItem(
    mediaId: number,
    mediaType: "movie" | "tv",
  ) {
    const ok = await removeFromWatchlist(watchlist.id, mediaId, mediaType);
    if (ok) {
      setItems((current) =>
        current.filter(
          (item) => !(item.media_id === mediaId && item.media_type === mediaType),
        ),
      );
      onUpdated();
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${watchlist.name}"?`)) return;
    setBusy(true);
    const ok = await deleteWatchlist(watchlist.id);
    if (ok) {
      onUpdated();
      onClose();
    }
    setBusy(false);
  }

  return (
    <div className='watchlist-detail-overlay' onClick={onClose} role='presentation'>
      <div
        className='watchlist-detail-panel'
        onClick={(event) => event.stopPropagation()}
        role='dialog'
        aria-labelledby='watchlist-detail-title'
      >
        <div className='watchlist-detail-header'>
          <div>
            <h2 className='text-2xl font-black' id='watchlist-detail-title'>
              {watchlist.name}
            </h2>
            {watchlist.description ? (
              <p className='mt-1 text-sm text-white/55'>{watchlist.description}</p>
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

        <div className='watchlist-detail-actions'>
          <button
            className='ghost-button'
            disabled={busy}
            onClick={togglePrivacy}
            type='button'
          >
            {privacy === "public" ? (
              <Globe className='size-4' />
            ) : (
              <Lock className='size-4' />
            )}
            {privacy === "public" ? "Public" : "Private"}
          </button>
          <button
            className='ghost-button'
            disabled={busy}
            onClick={handleShare}
            type='button'
          >
            {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
            {copied ? "Copied!" : "Share link"}
          </button>
          <button
            className='ghost-button text-red-300'
            disabled={busy}
            onClick={handleDelete}
            type='button'
          >
            <Trash2 className='size-4' />
            Delete
          </button>
        </div>

        {loading ? (
          <div className='flex min-h-40 items-center justify-center'>
            <Loader2 className='size-6 animate-spin text-white/40' />
          </div>
        ) : items.length ? (
          <div className='watchlist-detail-items'>
            {items.map((item) => (
              <div className='watchlist-detail-item' key={item.id}>
                <div className='relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-white/8'>
                  <Image
                    src={tmdbImage(item.poster_path, "w185")}
                    alt={item.title}
                    fill
                    sizes='56px'
                    className='object-cover'
                  />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-bold'>{item.title}</p>
                  <p className='text-xs text-white/45'>
                    {item.year} · {item.media_type === "movie" ? "Movie" : "Series"}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${item.title}`}
                  className='ghost-button !px-3 !py-3'
                  onClick={() =>
                    handleRemoveItem(
                      item.media_id,
                      item.media_type as "movie" | "tv",
                    )
                  }
                  type='button'
                >
                  <Trash2 className='size-4' />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className='empty-state min-h-40'>This watchlist is empty.</div>
        )}
      </div>
    </div>
  );
}
