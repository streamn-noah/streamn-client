// Generated from Supabase schema — keep in sync with migrations

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TasteProfile = {
  favoriteGenres?: number[];
  favoriteMovies?: Array<{
    id: number;
    title: string;
    genres: string[];
    genreIds: number[];
    director?: string;
    posterPath?: string | null;
  }>;
  directors?: string[];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      liked_media: {
        Row: {
          backdrop_path: string | null;
          genre_ids: number[];
          genres: string[];
          id: number;
          liked_at: string;
          media_id: number;
          media_type: string;
          overview: string | null;
          poster_path: string | null;
          title: string;
          user_id: string;
          vote_average: number | null;
          year: string | null;
        };
        Insert: {
          backdrop_path?: string | null;
          genre_ids?: number[];
          genres?: string[];
          id?: never;
          liked_at?: string;
          media_id: number;
          media_type: string;
          overview?: string | null;
          poster_path?: string | null;
          title: string;
          user_id: string;
          vote_average?: number | null;
          year?: string | null;
        };
        Update: {
          backdrop_path?: string | null;
          genre_ids?: number[];
          genres?: string[];
          id?: never;
          liked_at?: string;
          media_id?: number;
          media_type?: string;
          overview?: string | null;
          poster_path?: string | null;
          title?: string;
          user_id?: string;
          vote_average?: number | null;
          year?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          onboarding_complete: boolean;
          taste_profile: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          onboarding_complete?: boolean;
          taste_profile?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          onboarding_complete?: boolean;
          taste_profile?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      watch_history: {
        Row: {
          backdrop_path: string | null;
          episode_number: number;
          id: number;
          media_id: number;
          media_type: string;
          poster_path: string | null;
          progress_seconds: number;
          season_number: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          backdrop_path?: string | null;
          episode_number?: number;
          id?: never;
          media_id: number;
          media_type: string;
          poster_path?: string | null;
          progress_seconds?: number;
          season_number?: number;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          backdrop_path?: string | null;
          episode_number?: number;
          id?: never;
          media_id?: number;
          media_type?: string;
          poster_path?: string | null;
          progress_seconds?: number;
          season_number?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      watchlist_invites: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          watchlist_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          watchlist_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          watchlist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watchlist_invites_watchlist_id_fkey";
            columns: ["watchlist_id"];
            isOneToOne: false;
            referencedRelation: "watchlists";
            referencedColumns: ["id"];
          },
        ];
      };
      watchlist_items: {
        Row: {
          added_at: string;
          backdrop_path: string | null;
          id: number;
          media_id: number;
          media_type: string;
          poster_path: string | null;
          title: string;
          vote_average: number | null;
          watchlist_id: string;
          year: string | null;
        };
        Insert: {
          added_at?: string;
          backdrop_path?: string | null;
          id?: never;
          media_id: number;
          media_type: string;
          poster_path?: string | null;
          title: string;
          vote_average?: number | null;
          watchlist_id: string;
          year?: string | null;
        };
        Update: {
          added_at?: string;
          backdrop_path?: string | null;
          id?: never;
          media_id?: number;
          media_type?: string;
          poster_path?: string | null;
          title?: string;
          vote_average?: number | null;
          watchlist_id?: string;
          year?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey";
            columns: ["watchlist_id"];
            isOneToOne: false;
            referencedRelation: "watchlists";
            referencedColumns: ["id"];
          },
        ];
      };
      watchlists: {
        Row: {
          cover_poster_paths: string[];
          created_at: string;
          description: string | null;
          id: string;
          item_count: number;
          name: string;
          privacy: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cover_poster_paths?: string[];
          created_at?: string;
          description?: string | null;
          id?: string;
          item_count?: number;
          name: string;
          privacy?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cover_poster_paths?: string[];
          created_at?: string;
          description?: string | null;
          id?: string;
          item_count?: number;
          name?: string;
          privacy?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
