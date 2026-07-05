"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6 text-center">
      <h2 className="text-2xl font-bold mb-4 text-[#e50914]">Something went wrong!</h2>
      <p className="text-white/60 mb-6 max-w-md">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 bg-[#e50914] text-white font-semibold rounded hover:bg-[#b80710] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
