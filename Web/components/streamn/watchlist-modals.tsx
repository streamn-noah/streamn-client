import { useState, useEffect } from "react";
import Image from "next/image";
import { Globe, Loader2, Lock, Search, Trash2, UserPlus, UsersIcon, X } from "lucide-react";
import { tmdbImage, type MediaSummary, type MediaType } from "@/lib/media";
import { DefaultAvatarFace } from "@/components/streamn/default-avatar";
import {
  addToWatchlist,
  createInviteLink,
  updateWatchlist,
  deleteWatchlist,
} from "@/lib/user-actions";

export function AddItemsModal({
  watchlist,
  onClose,
  existingItems,
  onAdded,
}: {
  watchlist: any;
  onClose: () => void;
  existingItems: any[];
  onAdded?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setSearchLoading(false);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  async function handleAdd(item: MediaSummary) {
    const ok = await addToWatchlist(watchlist.id, item);
    if (ok && onAdded) {
      onAdded();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-black border border-white/20 p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="font-bold text-lg text-white">Add to "{watchlist.name}"</h3>
            <p className="text-xs text-white/50">Search movies or series to include</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-zinc-900/80 border border-white/15 pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-white transition-colors"
            placeholder="Search title..."
          />
          {searchLoading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-white/40" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          {searchResults.length > 0 ? (
            searchResults.map((item) => {
              const isAdded = existingItems.some(
                (i) => i.media_id === item.id && i.media_type === item.mediaType
              );

              return (
                <div
                  key={`addsearch-${item.id}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/70 border border-white/5 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-12 w-9 rounded overflow-hidden bg-black shrink-0">
                      <Image
                        src={tmdbImage(item.posterPath, "w92")}
                        alt={item.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                      <p className="text-xs text-white/50">
                        {item.year} · {item.mediaType === "movie" ? "Movie" : "Series"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isAdded}
                    onClick={() => handleAdd(item)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      isAdded
                        ? "bg-white/20 text-white/60 border border-white/20 opacity-80"
                        : "bg-white hover:bg-white/90 text-black"
                    }`}
                  >
                    {isAdded ? "Added" : "+ Add"}
                  </button>
                </div>
              );
            })
          ) : searchQuery ? (
            <div className="py-12 text-center text-xs text-white/40">
              {searchLoading ? "Searching..." : "No matching titles found"}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-white/40">
              Type a movie or show name above to search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InviteSettingsModal({
  watchlist,
  onClose,
  onUpdate,
  onDelete,
}: {
  watchlist: any;
  onClose: () => void;
  onUpdate?: (updates: any) => void;
  onDelete?: () => void;
}) {
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  async function handleShareWatchlist() {
    setInviteBusy(true);
    const link = await createInviteLink(watchlist.id);
    if (link) {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
    setInviteBusy(false);
  }

  async function handleTogglePrivacy() {
    const nextPrivacy = watchlist.privacy === "public" ? "private" : "public";
    setInviteBusy(true);
    const ok = await updateWatchlist(watchlist.id, { privacy: nextPrivacy });
    if (ok && onUpdate) {
      onUpdate({ privacy: nextPrivacy });
    }
    setInviteBusy(false);
  }

  async function handleDeleteWatchlist() {
    setInviteBusy(true);
    const ok = await deleteWatchlist(watchlist.id);
    if (ok && onDelete) {
      onDelete();
    }
    setInviteBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-black border border-white/20 p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="font-bold text-lg text-white">Invite & Settings</h3>
            <p className="text-xs text-white/50">{watchlist.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-white/70">Share Link</label>
            <button
              type="button"
              disabled={inviteBusy}
              onClick={handleShareWatchlist}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-black py-3 text-sm font-semibold transition-all hover:bg-white/90"
            >
              <UserPlus className="size-4" />
              <span>{inviteCopied ? "Copied!" : "Copy Invite Link"}</span>
            </button>
            <p className="text-[10px] text-white/40 text-center mt-1">
              Anyone with this link can view the watchlist.
            </p>
          </div>

          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={inviteBusy}
              onClick={handleTogglePrivacy}
              className="w-full flex items-center justify-between rounded-xl bg-white/5 hover:bg-white/10 p-3 text-sm font-semibold text-white transition-all"
            >
              <span className="flex items-center gap-2">
                {watchlist.privacy === "public" ? (
                  <Globe className="size-4 text-white" />
                ) : (
                  <Lock className="size-4 text-white/60" />
                )}
                <span>{watchlist.privacy === "public" ? "Public Watchlist" : "Private Watchlist"}</span>
              </span>
              <span className="text-xs text-white/50">Click to change</span>
            </button>
          </div>

          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={inviteBusy}
              onClick={handleDeleteWatchlist}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 py-3 text-sm font-semibold text-white/80 border border-white/10 transition-all"
            >
              <Trash2 className="size-4 text-white/60" />
              <span>Delete Watchlist</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MembersModal({
  watchlist,
  ownerProfile,
  onClose,
  onInviteClick,
}: {
  watchlist: any;
  ownerProfile: any;
  onClose: () => void;
  onInviteClick: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-black border border-white/20 p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="font-bold text-lg text-white">Members</h3>
            <p className="text-xs text-white/50">{watchlist.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full overflow-hidden bg-zinc-800 border border-white/10">
                {ownerProfile?.avatar_url ? (
                  <img src={ownerProfile.avatar_url} alt="Owner" className="w-full h-full object-cover" />
                ) : (
                  <DefaultAvatarFace className="w-full h-full" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{ownerProfile?.display_name || "You"}</p>
                <p className="text-xs text-white/50">Owner</p>
              </div>
            </div>
          </div>

        </div>

        <div className="pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              onClose();
              onInviteClick();
            }}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-all"
          >
            Invite More People
          </button>
        </div>
      </div>
    </div>
  );
}
