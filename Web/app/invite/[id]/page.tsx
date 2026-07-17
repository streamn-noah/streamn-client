"use client";

import Image from "next/image";
import { BookMarked, Check, Loader2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { StreamnNav } from "@/components/streamn/streamn-nav";
import { tmdbImage } from "@/lib/media";

type InvitePayload = {
  id: string;
  watchlists: {
    name: string;
    description: string | null;
    watchlist_items: Array<{
      id: number;
      title: string;
      poster_path: string | null;
      media_type: string;
    }>;
  };
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
    import("@/lib/user-actions").then(({ getInvite }) =>
      getInvite(params.id as string).then((data) => {
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

  if (!invite) {
    return (
      <main className="bg-black min-h-screen text-white flex items-center justify-center p-4 pl-0 md:pl-[72px]">
        <StreamnNav />
        <div className="w-full max-w-md rounded-2xl bg-black border border-white/20 p-8 shadow-2xl text-center space-y-4">
          <div className="size-12 rounded-full bg-white/10 flex items-center justify-center mx-auto text-white">
            <X className="size-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Invite Expired</h1>
          <p className="text-sm text-white/60">This watchlist invite link is no longer valid or has expired.</p>
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
  const items = list.watchlist_items ?? [];

  return (
    <main className="bg-black min-h-screen text-white flex items-center justify-center p-4 sm:p-6 pl-0 md:pl-[72px] transition-all duration-300">
      <StreamnNav />

      <div className="w-full max-w-lg rounded-2xl bg-black border border-white/20 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="size-10 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
            <BookMarked className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Watchlist Invite</h1>
            <p className="text-xs text-white/50">Shared with you on Streamn</p>
          </div>
        </div>

        <div>
          <p className="text-sm sm:text-base text-white/80 font-medium leading-relaxed">
            {accepted
              ? "Watchlist saved to your library!"
              : `You've been invited to save "${list.name}".`}
          </p>

          {list.description ? (
            <p className="mt-2 text-xs sm:text-sm text-white/50 leading-relaxed">{list.description}</p>
          ) : null}
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.slice(0, 6).map((item) => (
              <div
                className="relative aspect-[1/1.4] w-full overflow-hidden rounded-xl bg-zinc-900 border border-white/10 shadow-md"
                key={item.id}
              >
                <Image
                  src={tmdbImage(item.poster_path, "w342")}
                  alt={item.title}
                  fill
                  sizes="150px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {accepted ? (
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-white bg-white/10 border border-white/20 py-3 rounded-full animate-pulse">
            <Check className="size-4 text-green-400" />
            <span>Redirecting to Library...</span>
          </div>
        ) : (
          <div className="flex gap-3 pt-2">
            <button
              className="flex-1 py-3 px-6 rounded-full bg-white hover:bg-white/90 text-black font-bold text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              disabled={busy}
              onClick={() => respond("accept")}
              type="button"
            >
              {busy ? <Loader2 className="size-4 animate-spin text-black" /> : "Accept Invite"}
            </button>
            <button
              className="flex-1 py-3 px-6 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              disabled={busy}
              onClick={() => respond("decline")}
              type="button"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
