"use client";

import { Loader2, Plus, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { MediaSummary } from "@/lib/media";
import {
  addToWatchlist,
  createWatchlist,
  getMyWatchlists,
  isAddedToAnyWatchlist,
} from "@/lib/user-actions";
import type { Database } from "@/lib/supabase-types";

type WatchlistRow = Database["public"]["Tables"]["watchlists"]["Row"];

export function WatchlistPicker({
  item,
  onAdded,
  iconOnly = false,
  menuPosition = "down",
  customButtonClass,
  activeButtonClass,
}: {
  item: MediaSummary;
  onAdded?: () => void;
  iconOnly?: boolean;
  menuPosition?: "down" | "up";
  customButtonClass?: string;
  activeButtonClass?: string;
}) {
  const router = useRouter();
  const { user, setAuthModalOpen } = useAuth();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedSuccessfully, setAddedSuccessfully] = useState(false);
  const [isAlreadyAdded, setIsAlreadyAdded] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creating, setCreating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    isAddedToAnyWatchlist(item.id, item.mediaType).then(setIsAlreadyAdded);
  }, [user, item.id, item.mediaType]);

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
      setAddedSuccessfully(true);
      setIsAlreadyAdded(true);
      setTimeout(() => setAddedSuccessfully(false), 2000);
    }
    setAdding(null);
  }

  function openCreateModal() {
    setOpen(false);
    setNewWatchlistName("");
    setCreateModalOpen(true);
  }

  async function handleCreateConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!newWatchlistName.trim()) return;
    
    setCreating(true);
    const created = await createWatchlist(newWatchlistName.trim());
    if (created) {
      await addToWatchlist(created.id, item);
      onAdded?.();
      setCreateModalOpen(false);
      setAddedSuccessfully(true);
      setIsAlreadyAdded(true);
      setToastMessage("Watchlist created successfully");
      setToastVisible(true);
      setTimeout(() => {
        setToastVisible(false);
        setAddedSuccessfully(false);
        setTimeout(() => setToastMessage(null), 300);
      }, 3000);
    }
    setCreating(false);
  }

  return (
    <div className='watchlist-picker' ref={ref}>
      <button
        aria-label='Add to watchlist'
        className={
          (addedSuccessfully || isAlreadyAdded)
            ? (activeButtonClass || (customButtonClass ? customButtonClass : `ghost-button bg-white text-black hover:bg-white/90 ${iconOnly ? 'icon-button' : ''}`))
            : (customButtonClass || (iconOnly ? "icon-button ghost-button" : "ghost-button"))
        }
        onClick={() => {
          if (!requireAuth()) return;
          setOpen((value) => !value);
        }}
        type='button'
      >
        {addedSuccessfully || isAlreadyAdded ? (
          <Check className='size-5' />
        ) : (
          <Plus className='size-5' />
        )}
        {iconOnly ? null : (addedSuccessfully ? "Added" : isAlreadyAdded ? "Saved" : "Watchlist")}
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
                onClick={openCreateModal}
                type='button'
              >
                <Plus className='size-4' />
                New watchlist
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* Create Watchlist Modal */}
      {createModalOpen && typeof document !== "undefined" && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm rounded-2xl bg-[#1e232d] border border-white/10 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">New Watchlist</h3>
              <button 
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateConfirm}>
              <input
                autoFocus
                type="text"
                placeholder="Name your watchlist..."
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 mb-6"
              />
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white/70 hover:text-white hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newWatchlistName.trim() || creating}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {creating && <Loader2 className="size-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notification */}
      {toastMessage && typeof document !== "undefined" && createPortal(
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] transition-all duration-300 ease-out ${toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="bg-white text-black px-5 py-2.5 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2">
            <Check className="size-4" />
            {toastMessage}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

