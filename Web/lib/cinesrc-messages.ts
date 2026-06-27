import { type RefObject, useEffect } from "react";

export const CINESRC_ORIGIN = "https://cinesrc.st";

export type CinesrcMessageHandlers = {
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration?: number) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onResponse?: (command: string, result: unknown) => void;
  onError?: (error: unknown) => void;
};

export function sendCinesrcCommand(
  iframe: HTMLIFrameElement | null,
  command: string,
  args: unknown[] = [],
) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(
    { type: "cinesrc:command", command, args },
    CINESRC_ORIGIN,
  );
}

export function getCinesrcCurrentTime(
  iframe: HTMLIFrameElement | null,
): Promise<number> {
  return new Promise((resolve) => {
    if (!iframe?.contentWindow) {
      resolve(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(0);
    }, 1500);

    function onMessage(event: MessageEvent) {
      if (event.origin !== CINESRC_ORIGIN) return;
      if (event.data?.type !== "cinesrc:response") return;
      if (event.data.command !== "getCurrentTime") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(typeof event.data.result === "number" ? event.data.result : 0);
    }

    window.addEventListener("message", onMessage);
    sendCinesrcCommand(iframe, "getCurrentTime");
  });
}

export function useCinesrcMessages(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  handlers: CinesrcMessageHandlers,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== CINESRC_ORIGIN) return;
      if (!event.data || typeof event.data !== "object") return;

      const { type, currentTime, duration, volume, muted, command, result, error } =
        event.data as {
          type?: string;
          currentTime?: number;
          duration?: number;
          volume?: number;
          muted?: boolean;
          command?: string;
          result?: unknown;
          error?: unknown;
        };

      switch (type) {
        case "cinesrc:ready":
          handlers.onReady?.();
          break;
        case "cinesrc:play":
          handlers.onPlay?.();
          break;
        case "cinesrc:pause":
          handlers.onPause?.();
          break;
        case "cinesrc:ended":
          handlers.onEnded?.();
          break;
        case "cinesrc:timeupdate":
        case "cinesrc:seeked":
        case "cinesrc:seeking":
          if (typeof currentTime === "number") {
            handlers.onTimeUpdate?.(currentTime, duration);
          }
          break;
        case "cinesrc:volumechange":
          if (typeof volume === "number" && typeof muted === "boolean") {
            handlers.onVolumeChange?.(volume, muted);
          }
          break;
        case "cinesrc:response":
          if (command) handlers.onResponse?.(command, result);
          break;
        case "cinesrc:error":
          handlers.onError?.(error);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled, handlers]);
}
