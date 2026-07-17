"use client";

import { Loader2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { StreamnNav } from "@/components/streamn/streamn-nav";
import { WatchlistDetailView, type WatchlistDetailItem } from "@/components/streamn/watchlist-detail-view";

type InvitePayload = {
  id: string;
  watchlists: {
    name: string;
    description: string | null;
    watchlist_items: Array<{
      id: number;
      media_id: number;
      title: string;
      poster_path: string | null;
      media_type: string;
    }>;
  } | null;
};

export default function InvitePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    import("@/app/actions/invite-actions").then(({ getInviteAdmin }) =>
      getInviteAdmin(params.id as string).then((data) => {
        setInvite(data as InvitePayload | null);
        setLoading(false);
      }),
    );
  }, [params?.id]);

  async function respond(action: "accept" | "decline") {
    if (!user) {
      router.push(`/auth?next=/invite/${params?.id}`);
      return;
    }

    setBusy(true);
    await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, inviteId: params?.id }),
    });

    if (action === "accept") {
      setAccepted(true);
      window.setTimeout(() => router.replace("/library"), 1500);
    } else {
      router.replace("/discover");
    }
    setBusy(false);
  }

  if (authLoading || loading) {
    return (
      <main className="bg-black min-h-screen text-white flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-white/50" />
      </main>
    );
  }

  // Gracefully handle missing or expired invites, or missing watchlists
  if (!invite || !invite.watchlists) {
    return (
      <main className="bg-black min-h-screen text-white flex items-center justify-center p-4 pl-0 md:pl-[72px]">
        <StreamnNav />
        <div className="w-full max-w-md rounded-2xl bg-black border border-white/20 p-8 shadow-2xl text-center space-y-4">
          <div className="size-12 rounded-full bg-white/10 flex items-center justify-center mx-auto text-white">
            <X className="size-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Invite Invalid</h1>
          <p className="text-sm text-white/60">This watchlist invite link is no longer valid, expired, or the watchlist was deleted.</p>
          <button
            onClick={() => router.push("/discover")}
            className="w-full py-3 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition-all mt-4"
            type="button"
          >
            Go to Discover
          </button>
        </div>
      </main>
    );
  }

  const list = invite.watchlists;
  const items = (list.watchlist_items ?? []) as WatchlistDetailItem[];

  return (
    <WatchlistDetailView
      title={list.name}
      description={list.description}
      items={items}
      primaryAction={
        accepted ? (
          <button
            disabled
            className="flex items-center justify-center py-3 px-6 rounded-full bg-green-500/20 text-green-400 font-bold text-sm border border-green-500/30 transition-all cursor-default"
            type="button"
          >
            Added to Library!
          </button>
        ) : (
          <button
            onClick={() => respond("accept")}
            disabled={busy}
            className="flex items-center justify-center py-3 px-6 rounded-full bg-white hover:bg-white/90 text-black font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 min-w-[140px]"
            type="button"
          >
            {busy ? <Loader2 className="size-4 animate-spin text-black" /> : user ? "Accept Invite" : "Log in to Accept"}
          </button>
        )
      }
      secondaryActions={
        !accepted && (
          <button
            onClick={() => respond("decline")}
            disabled={busy}
            className="flex items-center justify-center py-3 px-6 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/10 transition-all"
            type="button"
          >
            Decline
          </button>
        )
      }
    />
  );
}
