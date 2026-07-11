"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/lib/supabase-types";
import { getContinueWatching } from "@/lib/streamn-storage";
import { syncWatchSession } from "@/lib/user-actions";
import { AuthView } from "@/components/auth/auth-view";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  authModalOpen: false,
  setAuthModalOpen: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentPath(window.location.pathname + window.location.search);
    }
  }, [authModalOpen]);

  async function fetchProfile(uid: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();
    setProfile(data ?? null);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  async function migrateLocalHistory(uid: string) {
    const key = `streamn-history-migrated:${uid}`;
    if (typeof window === "undefined" || localStorage.getItem(key)) return;

    const entries = getContinueWatching();
    await Promise.all(
      entries.map((entry) =>
        syncWatchSession({
          item: entry,
          progressSeconds: entry.progressSeconds,
          seasonNumber: entry.seasonNumber,
          episodeNumber: entry.episodeNumber,
        }),
      ),
    );
    localStorage.setItem(key, "1");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchProfile(data.session.user.id);
        migrateLocalHistory(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          fetchProfile(newSession.user.id);
          migrateLocalHistory(newSession.user.id);
        } else {
          setProfile(null);
        }
      },
    );

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signOut,
        refreshProfile,
        authModalOpen,
        setAuthModalOpen,
      }}
    >
      {children}
      
      {/* Global Auth Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setAuthModalOpen(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-[#0a0a0a] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 backdrop-blur-md transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="relative z-0">
              <AuthView returnTo={currentPath} isModal={true} />
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
