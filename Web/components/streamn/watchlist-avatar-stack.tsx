import { Globe, Lock } from "lucide-react";
import { DefaultAvatarFace } from "./default-avatar";

export function WatchlistAvatarStack({
  userAvatar,
  privacy,
}: {
  userAvatar?: string | null;
  privacy: string;
}) {
  return (
    <div className="flex items-center -space-x-2">
      <div className="size-8 rounded-full border-2 border-black overflow-hidden bg-zinc-800 z-10">
        {userAvatar ? (
          <img src={userAvatar} alt="Owner" className="w-full h-full object-cover" />
        ) : (
          <DefaultAvatarFace className="w-full h-full" />
        )}
      </div>
      <div className="size-8 rounded-full border-2 border-black overflow-hidden bg-zinc-700 flex items-center justify-center relative -ml-2">
        {privacy === "public" ? (
          <Globe className="size-3.5 text-white/80" />
        ) : (
          <Lock className="size-3.5 text-white/80" />
        )}
      </div>
    </div>
  );
}
