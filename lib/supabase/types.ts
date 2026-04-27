export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VenturePhase =
  | "discovery"
  | "build"
  | "launch"
  | "scale"
  | "dormant";

export type AllowedUserRole = "admin" | "member";

type AllowedUsersRow = {
  id: string;
  email: string;
  role: AllowedUserRole;
  invited_by: string | null;
  invited_at: string;
  last_login: string | null;
  active: boolean;
  notes: string | null;
};

type AllowedUsersInsert = {
  id?: string;
  email: string;
  role?: AllowedUserRole;
  invited_by?: string | null;
  invited_at?: string;
  last_login?: string | null;
  active?: boolean;
  notes?: string | null;
};

type AllowedUsersUpdate = Partial<AllowedUsersInsert>;

type WaitlistSignupsRow = {
  id: string;
  email: string;
  source: string | null;
  meta: Json;
  confirmed_at: string | null;
  invited_at: string | null;
  notes: string | null;
  created_at: string;
};

type WaitlistSignupsInsert = {
  id?: string;
  email: string;
  source?: string | null;
  meta?: Json;
  confirmed_at?: string | null;
  invited_at?: string | null;
  notes?: string | null;
  created_at?: string;
};

type WaitlistSignupsUpdate = Partial<WaitlistSignupsInsert>;

type VenturesRow = {
  id: string;
  slug: string;
  name: string;
  phase: VenturePhase;
  north_star: string | null;
  company_md: string | null;
  loops_enabled: Json;
  intel_sources: Json;
  created_at: string;
  updated_at: string;
};

type VenturesInsert = {
  id?: string;
  slug: string;
  name: string;
  phase: VenturePhase;
  north_star?: string | null;
  company_md?: string | null;
  loops_enabled?: Json;
  intel_sources?: Json;
  created_at?: string;
  updated_at?: string;
};

type VenturesUpdate = Partial<VenturesInsert>;

type EventsRow = {
  id: string;
  ts: string;
  venture_id: string | null;
  source: string;
  type: string;
  actor: string | null;
  payload: Json;
  hash: string | null;
};

type EventsInsert = {
  id?: string;
  ts?: string;
  venture_id?: string | null;
  source: string;
  type: string;
  actor?: string | null;
  payload?: Json;
  hash?: string | null;
};

type EventsUpdate = Partial<EventsInsert>;

type LooseRow = Record<string, unknown>;

type NoRelationships = [];

export type Database = {
  public: {
    Tables: {
      allowed_users: {
        Row: AllowedUsersRow;
        Insert: AllowedUsersInsert;
        Update: AllowedUsersUpdate;
        Relationships: NoRelationships;
      };
      waitlist_signups: {
        Row: WaitlistSignupsRow;
        Insert: WaitlistSignupsInsert;
        Update: WaitlistSignupsUpdate;
        Relationships: NoRelationships;
      };
      ventures: {
        Row: VenturesRow;
        Insert: VenturesInsert;
        Update: VenturesUpdate;
        Relationships: NoRelationships;
      };
      events: {
        Row: EventsRow;
        Insert: EventsInsert;
        Update: EventsUpdate;
        Relationships: NoRelationships;
      };
      decisions: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: NoRelationships;
      };
      artifacts: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: NoRelationships;
      };
      loop_runs: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: NoRelationships;
      };
      metric_snapshots: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: NoRelationships;
      };
      anomalies: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: NoRelationships;
      };
      support_tickets: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
