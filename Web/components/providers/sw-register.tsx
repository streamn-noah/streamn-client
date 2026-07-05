"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Streamn PWA Service Worker registered with scope:", registration.scope);
          })
          .catch((error) => {
            console.warn("Streamn PWA Service Worker registration failed:", error);
          });
      });
    }
  }, []);

  return null;
}
