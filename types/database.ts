/**
 * Supabase database schema types for StackPulse.
 *
 * Hand-maintained equivalent of `supabase gen types typescript` output:
 * - `*Row`      shape of a table row (mirrors `xRow` tables)
 * - `*Insert`   payload for INSERTs (server-defaulted columns omitted)
 * - `*Update`   payload for UPDATEs (all-optional; primary keys excluded)
 *
 * All shapes are type aliases — see the note above `Database` for why they
 * must never be re-declared as interfaces.
 *
 * NOTE: `Incident` / `TelemetryLog` here describe the database rows; the
 * client-side simulation record lives in `types/pulse.ts` and is deliberately
 * kept separate.
 */

/* -------------------------------------------------------------------------- */
/*  Enumerations (backed by text / enum columns)                               */
/* -------------------------------------------------------------------------- */

export type ServiceType = "api" | "database" | "cache" | "external"

export type ServiceStatus = "healthy" | "degraded" | "down"

export type ServiceRelation = "sync" | "async" | "fallback"

export type IncidentSeverity = "info" | "warning" | "critical"

export type IncidentStatus = "active" | "resolved"

/* -------------------------------------------------------------------------- */
/*  Rows                                                                       */
/* -------------------------------------------------------------------------- */

export type Project = {
  id: string
  name: string
  slug: string
  description: string | null
  created_at: string
}

export type ServicePosition = {
  x: number
  y: number
}

export type Service = {
  id: string
  project_id: string
  name: string
  type: ServiceType
  /** Public URL of the service endpoint; null for internal-only nodes. */
  endpoint_url: string | null
  status: ServiceStatus
  /** Round-trip latency in milliseconds. */
  latency_ms: number
  /** Rolling availability in percent (0–100). */
  uptime_pct: number
  /** Canvas coordinates (JSONB). */
  position: ServicePosition
}

export type ServiceEdge = {
  id: string
  project_id: string
  /** Caller service id (depends on / sends traffic to `target_id`). */
  source_id: string
  /** Callee service id. */
  target_id: string
  relation: ServiceRelation
}

export type Incident = {
  id: string
  project_id: string
  root_service_id: string
  /** Transitive dependents impacted by the root failure (text[]). */
  impacted_service_ids: string[]
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description: string | null
  /** AI-generated root-cause analysis and remediation steps. */
  ai_diagnosis: string | null
  started_at: string
  resolved_at: string | null
}

export type TelemetryLog = {
  id: string
  service_id: string
  /** Sample timestamp (timestamptz). */
  timestamp: string
  latency_ms: number
  status_code: number
  is_error: boolean
}

/* -------------------------------------------------------------------------- */
/*  Inserts (primary keys + server defaults omitted)                           */
/* -------------------------------------------------------------------------- */

export type ProjectInsert = {
  id?: string
  name: string
  slug: string
  description?: string | null
  created_at?: string
}

export type ServiceInsert = {
  id?: string
  project_id: string
  name: string
  type: ServiceType
  endpoint_url?: string | null
  status?: ServiceStatus
  latency_ms?: number
  uptime_pct?: number
  position?: ServicePosition
}

export type ServiceEdgeInsert = {
  id?: string
  project_id: string
  source_id: string
  target_id: string
  relation: ServiceRelation
}

export type IncidentInsert = {
  id?: string
  project_id: string
  root_service_id: string
  impacted_service_ids: string[]
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description?: string | null
  ai_diagnosis?: string | null
  started_at?: string
  resolved_at?: string | null
}

export type TelemetryLogInsert = {
  id?: string
  service_id: string
  timestamp?: string
  latency_ms: number
  status_code: number
  is_error: boolean
}

/* -------------------------------------------------------------------------- */
/*  Updates (immutable columns excluded)                                       */
/* -------------------------------------------------------------------------- */

export type ProjectUpdate = Partial<Omit<ProjectInsert, "id">>
export type ServiceUpdate = Partial<Omit<ServiceInsert, "id" | "project_id">>
export type ServiceEdgeUpdate = Partial<Omit<ServiceEdgeInsert, "id" | "project_id">>
export type IncidentUpdate = Partial<Omit<IncidentInsert, "id" | "project_id">>
export type TelemetryLogUpdate = Partial<Omit<TelemetryLogInsert, "id" | "service_id">>

/* -------------------------------------------------------------------------- */
/*  Database definition                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Table shape: `Row`/`Insert`/`Update` plus the Relationships array Supabase's
 * generated types always emit (empty here — no FK relations modeled).
 */
type TableDefinition<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

/**
 * Public schema definition consumed by the typed Supabase clients.
 *
 * IMPORTANT: every shape in this file is a type ALIAS, never an interface.
 * Supabase's `Schema extends GenericSchema` check requires `Tables[...].Row`
 * (and Insert/Update) to be assignable to `Record<string, unknown>`, and only
 * type aliases receive implicit index signatures — an `interface` fails that
 * check, the schema resolves to `never`, and every table builder silently
 * collapses (`.update()` takes `never`, row data loses all properties).
 */
export type Database = {
  public: {
    Tables: {
      projects: TableDefinition<Project, ProjectInsert, ProjectUpdate>
      services: TableDefinition<Service, ServiceInsert, ServiceUpdate>
      service_edges: TableDefinition<ServiceEdge, ServiceEdgeInsert, ServiceEdgeUpdate>
      incidents: TableDefinition<Incident, IncidentInsert, IncidentUpdate>
      telemetry_logs: TableDefinition<TelemetryLog, TelemetryLogInsert, TelemetryLogUpdate>
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
