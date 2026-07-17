"use client";

import { useState } from "react";
import { Plus, UserPlus, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { AddItemsModal, InviteSettingsModal, MembersModal } from "./watchlist-modals";
import { WatchlistAvatarStack } from "./watchlist-avatar-stack";

export function WatchlistClientActions({
  watchlist,
  ownerProfile,
  existingItems,
  onUpdate,
}: {
  watchlist: any;
  ownerProfile: any;
  existingItems: any[];
  onUpdate?: () => void;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowMembers(true)}
        className="cursor-pointer transition-transform hover:scale-105 mr-2"
        type="button"
      >
        <WatchlistAvatarStack
          userAvatar={ownerProfile?.avatar_url}
          privacy={watchlist.privacy}
        />
      </button>

      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all border border-white/5"
        type="button"
      >
        <Plus className="size-4" />
        <span>Add</span>
      </button>

      <button
        onClick={() => setShowInvite(true)}
        className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all border border-white/5 hidden sm:flex"
        type="button"
      >
        <UserPlus className="size-4" />
        <span>Share</span>
      </button>

      <button
        onClick={() => setShowInvite(true)}
        className="flex items-center justify-center size-9 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all border border-white/5"
        type="button"
        title="Settings & More"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {showAdd && (
        <AddItemsModal
          watchlist={watchlist}
          existingItems={existingItems}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            if (onUpdate) onUpdate();
            else router.refresh();
          }}
        />
      )}

      {showInvite && (
        <InviteSettingsModal
          watchlist={watchlist}
          onClose={() => setShowInvite(false)}
          onUpdate={() => {
            if (onUpdate) onUpdate();
            else router.refresh();
          }}
          onDelete={() => {
            router.push("/library");
          }}
        />
      )}

      {showMembers && (
        <MembersModal
          watchlist={watchlist}
          ownerProfile={ownerProfile}
          onClose={() => setShowMembers(false)}
          onInviteClick={() => setShowInvite(true)}
        />
      )}
    </>
  );
}
