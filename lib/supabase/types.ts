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

export type MemorySource = string; // 'manual','agent:<name>','digest','retrospective','elicitation_resolved'

type MemoriesRow = {
  id: string;
  venture_id: string | null;
  ts: string;
  source: MemorySource;
  text: string;
  tags: string[];
  embedding: number[] | null;
  embedded_at: string | null;
  metadata: Json;
  created_at: string;
};

type MemoriesInsert = {
  id?: string;
  venture_id?: string | null;
  ts?: string;
  source: MemorySource;
  text: string;
  tags?: string[];
  embedding?: number[] | null;
  embedded_at?: string | null;
  metadata?: Json;
  created_at?: string;
};

type MemoriesUpdate = Partial<MemoriesInsert>;

export type VentureChunkSource = "company_md" | "runbook" | "spec";

type VentureChunksRow = {
  id: string;
  venture_id: string | null;
  source: VentureChunkSource;
  source_version: number;
  ord: number;
  text: string;
  embedding: number[] | null;
  embedded_at: string | null;
  created_at: string;
};

type VentureChunksInsert = {
  id?: string;
  venture_id?: string | null;
  source: VentureChunkSource;
  source_version?: number;
  ord: number;
  text: string;
  embedding?: number[] | null;
  embedded_at?: string | null;
  created_at?: string;
};

type VentureChunksUpdate = Partial<VentureChunksInsert>;

export type LoopRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "blown_budget"
  | "cancelled";

type LoopRunsRow = {
  id: string;
  ts: string;
  loop_name: string;
  venture_id: string | null;
  trigger: string | null;
  input: Json;
  output_artifact_id: string | null;
  output_decision_id: string | null;
  status: LoopRunStatus;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  duration_ms: number | null;
  budget_tokens: number | null;
  budget_cents: number | null;
  model: string | null;
  error_message: string | null;
};

type LoopRunsInsert = {
  id?: string;
  ts?: string;
  loop_name: string;
  venture_id?: string | null;
  trigger?: string | null;
  input?: Json;
  output_artifact_id?: string | null;
  output_decision_id?: string | null;
  status: LoopRunStatus;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_cents?: number | null;
  duration_ms?: number | null;
  budget_tokens?: number | null;
  budget_cents?: number | null;
  model?: string | null;
  error_message?: string | null;
};

type LoopRunsUpdate = Partial<LoopRunsInsert>;

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
        Row: LoopRunsRow;
        Insert: LoopRunsInsert;
        Update: LoopRunsUpdate;
        Relationships: NoRelationships;
      };
      memories: {
        Row: MemoriesRow;
        Insert: MemoriesInsert;
        Update: MemoriesUpdate;
        Relationships: NoRelationships;
      };
      venture_chunks: {
        Row: VentureChunksRow;
        Insert: VentureChunksInsert;
        Update: VentureChunksUpdate;
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
    Views: {
      embedding_backlog: {
        Row: {
          table_name: "decisions" | "artifacts" | "memories" | "venture_chunks";
          id: string;
          text: string | null;
          ts: string;
        };
        Insert: never;
        Update: never;
        Relationships: NoRelationships;
      };
    };
    Functions: {
      match_decisions: {
        Args: {
          p_venture_id: string;
          p_query: number[];
          p_min_similarity?: number;
          p_limit?: number;
        };
        Returns: Array<{
          id: string;
          ts: string;
          text: string;
          similarity: number;
          metadata: Json;
        }>;
      };
      match_artifacts: {
        Args: {
          p_venture_id: string;
          p_query: number[];
          p_min_similarity?: number;
          p_limit?: number;
        };
        Returns: Array<{
          id: string;
          ts: string;
          text: string;
          similarity: number;
          metadata: Json;
        }>;
      };
      match_memories: {
        Args: {
          p_venture_id: string;
          p_query: number[];
          p_min_similarity?: number;
          p_limit?: number;
        };
        Returns: Array<{
          id: string;
          ts: string;
          text: string;
          similarity: number;
          metadata: Json;
        }>;
      };
      match_venture_chunks: {
        Args: {
          p_venture_id: string;
          p_query: number[];
          p_min_similarity?: number;
          p_limit?: number;
        };
        Returns: Array<{
          id: string;
          ts: string;
          text: string;
          similarity: number;
          metadata: Json;
        }>;
      };
    };
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
