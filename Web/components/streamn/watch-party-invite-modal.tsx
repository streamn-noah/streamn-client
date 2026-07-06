"use client";

import { useState } from "react";
import { Check, Copy, Users, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

export function WatchPartyInviteModal({
  isOpen,
  onClose,
  mediaType,
  mediaId,
  season,
  episode,
}: {
  isOpen: boolean;
  onClose: () => void;
  mediaType: string;
  mediaId: number;
  season?: number;
  episode?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [roomId] = useState(() => crypto.randomUUID());

  // Generate invite link based on current window location
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const inviteLink = `${baseUrl}/watchparty/${roomId}?mediaType=${mediaType}&mediaId=${mediaId}&s=${season || 1}&e=${episode || 1}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[1000] w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-3xl bg-[#111] p-6 shadow-2xl border border-white/10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            <X className="size-5" />
          </button>
          
          <div className="flex flex-col items-center text-center space-y-4 mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <Users className="size-8 text-white" />
            </div>
            <div>
              <Dialog.Title className="text-xl font-bold text-white mb-1">
                Create Watch Party
              </Dialog.Title>
              <Dialog.Description className="text-sm text-white/60">
                Share this link with friends to watch together. They don't need an account to join!
              </Dialog.Description>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <input
                readOnly
                value={inviteLink}
                className="w-full rounded-xl bg-black/50 border border-white/10 px-4 py-4 pr-12 text-sm text-white outline-none focus:border-white/30"
              />
              <button
                onClick={handleCopy}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-white p-2 text-black hover:bg-white/90 transition"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            </div>

            <a
              href={`${inviteLink}&host=1`}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-black hover:bg-white/90 transition"
              onClick={onClose}
            >
              Join Room Now
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
