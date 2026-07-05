"use client";

export function DefaultAvatarFace({ className }: { className?: string }) {
  return (
    <div className={`relative rounded-full p-[2px] bg-zinc-700/80 shadow-xl shrink-0 ${className ?? "size-14 md:size-16"}`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full rounded-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00A2FF" />
            <stop offset="50%" stopColor="#0066FF" />
            <stop offset="100%" stopColor="#9E27FF" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill="url(#avatarGrad)" />
        {/* Eyes */}
        <circle cx="37" cy="46" r="4.5" fill="white" />
        <circle cx="68" cy="46" r="4.5" fill="white" />
        {/* Smile curve */}
        <path
          d="M 50 62 Q 62 64 72 57"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
