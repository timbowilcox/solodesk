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

export type VentureMarkSlug =
  | "kounta"
  | "corum"
  | "counsel"
  | "canemate"
  | "realstyler"
  | "realtelligence"
  | "generic";

type VenturesRow = {
  id: string;
  slug: string;
  name: string;
  phase: VenturePhase;
  north_star: string | null;
  company_md: string | null;
  loops_enabled: Json;
  intel_sources: Json;
  accent_color: string;
  mark_slug: VentureMarkSlug;
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
  accent_color?: string;
  mark_slug?: VentureMarkSlug;
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

export type DocumentType =
  | "decision"
  | "content"
  | "intel_digest"
  | "support_ticket"
  | "daily_digest"
  | "triage_queue"
  | "portfolio_audit";

export type DocumentStatus =
  | "draft"
  | "reviewing"
  | "approved"
  | "rejected"
  | "published"
  | "archived"
  | "drafting"
  | "cancelled"
  | "drafting_orphaned";

export type SectionKind =
  | "prose"
  | "recommendation"
  | "alternatives"
  | "kill_criteria"
  | "evidence"
  | "risk"
  | "agent_note"
  | "comment_thread"
  | "metric_block"
  | "intel_signal"
  | "intel_signals_table"
  | "support_reply_block"
  | "content_block";

export type SectionStatus =
  | "draft"
  | "reviewing"
  | "approved"
  | "revising"
  | "rejected"
  | "dismissed"
  | "deferred";

export type CommentStatus = "open" | "accepted" | "dismissed" | "replied";

type DocumentsRow = {
  id: string;
  venture_id: string | null;
  type: DocumentType;
  title: string;
  status: DocumentStatus;
  loop_name: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Json;
};

type DocumentsInsert = {
  id?: string;
  venture_id: string | null;
  type: DocumentType;
  title: string;
  status?: DocumentStatus;
  loop_name: string;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Json;
};

type DocumentsUpdate = Partial<DocumentsInsert>;

type SectionsRow = {
  id: string;
  document_id: string;
  kind: SectionKind;
  ord: number;
  content: Json;
  status: SectionStatus;
  version: number;
  parent_version: string | null;
  embedding: number[] | null;
  embedding_text: string | null;
  embedded_at: string | null;
  created_at: string;
  updated_at: string;
};

type SectionsInsert = {
  id?: string;
  document_id: string;
  kind: SectionKind;
  ord: number;
  content?: Json;
  status?: SectionStatus;
  version?: number;
  parent_version?: string | null;
  embedding?: number[] | null;
  embedding_text?: string | null;
  embedded_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type SectionsUpdate = Partial<SectionsInsert>;

type CommentsRow = {
  id: string;
  section_id: string;
  author: string;
  body: string;
  evidence: Json;
  status: CommentStatus;
  dismiss_reason: string | null;
  resolved_at: string | null;
  created_at: string;
};

type CommentsInsert = {
  id?: string;
  section_id: string;
  author: string;
  body: string;
  evidence?: Json;
  status?: CommentStatus;
  dismiss_reason?: string | null;
  resolved_at?: string | null;
  created_at?: string;
};

type CommentsUpdate = Partial<CommentsInsert>;

export type VentureMemberRole = "operator" | "editor" | "viewer";

type VentureMembersRow = {
  id: string;
  venture_id: string;
  user_id: string;
  role: VentureMemberRole;
  created_by: string | null;
  created_at: string;
};

type VentureMembersInsert = {
  id?: string;
  venture_id: string;
  user_id: string;
  role?: VentureMemberRole;
  created_by?: string | null;
  created_at?: string;
};

type VentureMembersUpdate = Partial<VentureMembersInsert>;

export type ConnectionAction =
  | "fetched"
  | "rotated"
  | "created"
  | "revoked"
  | "denied";

type ConnectionsRow = {
  id: string;
  venture_id: string;
  provider: string;
  display_name: string;
  vault_secret_id: string;
  scope_metadata: Json;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
};

type ConnectionsInsert = {
  id?: string;
  venture_id: string;
  provider: string;
  display_name: string;
  vault_secret_id: string;
  scope_metadata?: Json;
  created_by?: string | null;
  created_at?: string;
  revoked_at?: string | null;
};

type ConnectionsUpdate = Partial<ConnectionsInsert>;

type ConnectionAuditRow = {
  id: string;
  connection_id: string;
  action: ConnectionAction;
  called_by_loop_id: string | null;
  called_at: string;
  request_summary: string | null;
  response_status: number | null;
};

type ConnectionAuditInsert = {
  id?: string;
  connection_id: string;
  action: ConnectionAction;
  called_by_loop_id?: string | null;
  called_at?: string;
  request_summary?: string | null;
  response_status?: number | null;
};

type ConnectionAuditUpdate = Partial<ConnectionAuditInsert>;

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
  cancel_requested_at: string | null;
  last_section_ord: number | null;
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
  cancel_requested_at?: string | null;
  last_section_ord?: number | null;
};

type LoopRunsUpdate = Partial<LoopRunsInsert>;

export type DayItemType =
  | "document"
  | "agent_note"
  | "anomaly"
  | "support_ticket";

type DayItemDismissalsRow = {
  id: string;
  user_id: string;
  item_type: DayItemType;
  item_id: string;
  dismissed_at: string;
};

type DayItemDismissalsInsert = {
  id?: string;
  user_id: string;
  item_type: DayItemType;
  item_id: string;
  dismissed_at?: string;
};

type DayItemDismissalsUpdate = Partial<DayItemDismissalsInsert>;

export type LoopThreadStatus = "open" | "closed" | "archived";
export type LoopThreadMessageRole =
  | "operator"
  | "agent"
  | "critic"
  | "document";

type LoopThreadsRow = {
  id: string;
  venture_id: string;
  user_id: string | null;
  loop_name: string;
  title: string | null;
  status: LoopThreadStatus;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type LoopThreadsInsert = {
  id?: string;
  venture_id: string;
  user_id?: string | null;
  loop_name: string;
  title?: string | null;
  status?: LoopThreadStatus;
  metadata?: Json;
  created_at?: string;
  updated_at?: string;
};

type LoopThreadsUpdate = Partial<LoopThreadsInsert>;

type LoopThreadMessagesRow = {
  id: string;
  thread_id: string;
  role: LoopThreadMessageRole;
  body: string;
  document_id: string | null;
  loop_run_id: string | null;
  created_at: string;
};

type LoopThreadMessagesInsert = {
  id?: string;
  thread_id: string;
  role: LoopThreadMessageRole;
  body?: string;
  document_id?: string | null;
  loop_run_id?: string | null;
  created_at?: string;
};

type LoopThreadMessagesUpdate = Partial<LoopThreadMessagesInsert>;

export type AnomalyFingerprintSource = "webhook" | "threshold" | "manual";

type AnomalyFingerprintsRow = {
  id: string;
  venture_id: string;
  fingerprint: string;
  document_id: string | null;
  source: AnomalyFingerprintSource;
  payload: Json;
  created_at: string;
};

type AnomalyFingerprintsInsert = {
  id?: string;
  venture_id: string;
  fingerprint: string;
  document_id?: string | null;
  source: AnomalyFingerprintSource;
  payload?: Json;
  created_at?: string;
};

type AnomalyFingerprintsUpdate = Partial<AnomalyFingerprintsInsert>;

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
      documents: {
        Row: DocumentsRow;
        Insert: DocumentsInsert;
        Update: DocumentsUpdate;
        Relationships: NoRelationships;
      };
      sections: {
        Row: SectionsRow;
        Insert: SectionsInsert;
        Update: SectionsUpdate;
        Relationships: NoRelationships;
      };
      comments: {
        Row: CommentsRow;
        Insert: CommentsInsert;
        Update: CommentsUpdate;
        Relationships: NoRelationships;
      };
      connections: {
        Row: ConnectionsRow;
        Insert: ConnectionsInsert;
        Update: ConnectionsUpdate;
        Relationships: NoRelationships;
      };
      connection_audit: {
        Row: ConnectionAuditRow;
        Insert: ConnectionAuditInsert;
        Update: ConnectionAuditUpdate;
        Relationships: NoRelationships;
      };
      venture_members: {
        Row: VentureMembersRow;
        Insert: VentureMembersInsert;
        Update: VentureMembersUpdate;
        Relationships: NoRelationships;
      };
      day_item_dismissals: {
        Row: DayItemDismissalsRow;
        Insert: DayItemDismissalsInsert;
        Update: DayItemDismissalsUpdate;
        Relationships: NoRelationships;
      };
      loop_threads: {
        Row: LoopThreadsRow;
        Insert: LoopThreadsInsert;
        Update: LoopThreadsUpdate;
        Relationships: NoRelationships;
      };
      loop_thread_messages: {
        Row: LoopThreadMessagesRow;
        Insert: LoopThreadMessagesInsert;
        Update: LoopThreadMessagesUpdate;
        Relationships: NoRelationships;
      };
      anomaly_fingerprints: {
        Row: AnomalyFingerprintsRow;
        Insert: AnomalyFingerprintsInsert;
        Update: AnomalyFingerprintsUpdate;
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
          table_name:
            | "decisions"
            | "artifacts"
            | "memories"
            | "venture_chunks"
            | "sections";
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
      match_sections: {
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
      vault_put: {
        Args: { p_payload: string; p_name?: string | null };
        Returns: string;
      };
      vault_get: {
        Args: { p_id: string };
        Returns: string;
      };
      vault_rotate: {
        Args: { p_id: string; p_payload: string };
        Returns: void;
      };
      vault_delete: {
        Args: { p_id: string };
        Returns: void;
      };
      bridge_tiles: {
        Args: { p_user_id: string | null; p_is_admin: boolean };
        Returns: Array<{
          venture_id: string;
          slug: string;
          name: string;
          phase: VenturePhase;
          accent_color: string;
          mark_slug: VentureMarkSlug;
          state: "active" | "idle" | "quiet";
          pending_count: number;
          last_activity_at: string | null;
          vital_sign: string | null;
          sparkline: number[];
          connections: string[];
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
