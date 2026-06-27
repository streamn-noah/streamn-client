"use client";

import Image from "next/image";
import { Check, Loader2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
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
    import("@/lib/user-actions").then(({ getInvite }) =>
      getInvite(params.id).then((data) => {
        setInvite(data as InvitePayload | null);
        setLoading(false);
      }),
    );
  }, [params.id]);

  async function respond(action: "accept" | "decline") {
    if (!user) {
      router.push(`/auth?next=/invite/${params.id}`);
      return;
    }

    setBusy(true);
    await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, inviteId: params.id }),
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
      <main className='auth-page-shell flex items-center justify-center'>
        <Loader2 className='size-8 animate-spin text-white/50' />
      </main>
    );
  }

  if (!invite) {
    return (
      <main className='auth-page-shell flex items-center justify-center px-6'>
        <div className='auth-card text-center'>
          <X className='mx-auto size-10 text-red-400' />
          <h1 className='auth-headline mt-4'>Invite expired</h1>
          <p className='auth-subtext'>This link is no longer valid.</p>
        </div>
      </main>
    );
  }

  const list = invite.watchlists;
  const items = list.watchlist_items ?? [];

  return (
    <main className='auth-page-shell'>
      <div className='morph-bg' />
      <div className='grain' />
      <div className='auth-card reveal max-w-lg'>
        <h1 className='auth-headline'>Watchlist invite</h1>
        <p className='auth-subtext'>
          {accepted
            ? "Watchlist saved to your library!"
            : `You've been invited to save "${list.name}".`}
        </p>

        {list.description ? (
          <p className='mb-4 text-sm text-white/55'>{list.description}</p>
        ) : null}

        <div className='library-grid mb-6'>
          {items.slice(0, 6).map((item) => (
            <div className='library-media-card' key={item.id}>
              <Image
                src={tmdbImage(item.poster_path, "w342")}
                alt={item.title}
                fill
                sizes='100px'
                className='object-cover'
              />
            </div>
          ))}
        </div>

        {accepted ? (
          <div className='flex items-center justify-center gap-2 text-green-400'>
            <Check className='size-5' />
            Redirecting to Library...
          </div>
        ) : (
          <div className='flex flex-wrap gap-3'>
            <button
              className='auth-cta-button flex-1'
              disabled={busy}
              onClick={() => respond("accept")}
              type='button'
            >
              {busy ? <Loader2 className='size-5 animate-spin' /> : "Accept"}
            </button>
            <button
              className='ghost-button flex-1'
              disabled={busy}
              onClick={() => respond("decline")}
              type='button'
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
