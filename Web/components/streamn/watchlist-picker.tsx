"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { MediaSummary } from "@/lib/media";
import {
  addToWatchlist,
  createWatchlist,
  getMyWatchlists,
} from "@/lib/user-actions";
import type { Database } from "@/lib/supabase-types";

type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"];

export function WatchlistPicker({
  item,
  onAdded,
  iconOnly = false,
  menuPosition = "down",
}: {
  item: MediaSummary;
  onAdded?: () => void;
  iconOnly?: boolean;
  menuPosition?: "down" | "up";
}) {
  const router = useRouter();
  const { user, setAuthModalOpen } = useAuth();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    getMyWatchlists()
      .then(setLists)
      .finally(() => setLoading(false));
  }, [open, user]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function requireAuth() {
    if (!user) {
      setAuthModalOpen(true);
      return false;
    }
    return true;
  }

  async function handleAdd(watchlistId: string) {
    setAdding(watchlistId);
    const ok = await addToWatchlist(watchlistId, item);
    if (ok) {
      onAdded?.();
      setOpen(false);
    }
    setAdding(null);
  }

  async function handleCreate() {
    const name = window.prompt("New watchlist name");
    if (!name?.trim()) return;
    setAdding("new");
    const created = await createWatchlist(name.trim());
    if (created) {
      await addToWatchlist(created.id, item);
      onAdded?.();
      setOpen(false);
    }
    setAdding(null);
  }

  return (
    <div className='watchlist-picker' ref={ref}>
      <button
        aria-label='Add to watchlist'
        className={iconOnly ? "icon-button ghost-button" : "ghost-button"}
        onClick={() => {
          if (!requireAuth()) return;
          setOpen((value) => !value);
        }}
        type='button'
      >
        <Plus className='size-5' />
        {iconOnly ? null : "Watchlist"}
      </button>

      {open ? (
        <div
          className={`watchlist-picker-menu ${
            menuPosition === "up" ? "watchlist-picker-menu-up" : ""
          }`}
        >
          <p className='mb-2 text-xs font-bold uppercase tracking-wider text-white/40'>
            Add to watchlist
          </p>
          {loading ? (
            <Loader2 className='mx-auto size-5 animate-spin text-white/40' />
          ) : (
            <>
              {lists.map((list) => (
                <button
                  className='watchlist-picker-item'
                  disabled={adding === list.id}
                  key={list.id}
                  onClick={() => handleAdd(list.id)}
                  type='button'
                >
                  {adding === list.id ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : null}
                  {list.name}
                </button>
              ))}
              <button
                className='watchlist-picker-item watchlist-picker-item-new'
                disabled={adding === "new"}
                onClick={handleCreate}
                type='button'
              >
                <Plus className='size-4' />
                New watchlist
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

