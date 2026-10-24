/**
 * Contracts for the chaos simulation API (`POST /api/chaos`) and the domain
 * results its underlying library returns. Kept next to the database types so
 * both the route layer and the domain layer share one source of truth.
 */

/* -------------------------------------------------------------------------- */
/*  HTTP request                                                               */
/* -------------------------------------------------------------------------- */

export interface ChaosRequest {
  serviceId: string
  projectId: string
  mode: "break" | "recover"
}

/* -------------------------------------------------------------------------- */
/*  Domain results (returned by lib/chaos)                                     */
/* -------------------------------------------------------------------------- */

export interface ChaosBreakResult {
  ok: true
  /** Dependent service ids impacted by the failure. */
  blastRadius: string[]
  /** Id of the incident opened for this failure. */
  incidentId: string
}

export interface ChaosRecoverResult {
  ok: true
  /** Always empty for recovery. */
  blastRadius: string[]
  /** Number of incidents resolved by recovery. */
  resolvedIncidents: number
}

/** Failure reason; the HTTP layer maps these to status codes. */
export type ChaosFailureReason = "not_found" | "database"

export interface ChaosFailure {
  ok: false
  reason: ChaosFailureReason
  message: string
}

/* -------------------------------------------------------------------------- */
/*  HTTP responses                                                             */
/* -------------------------------------------------------------------------- */

export interface ChaosBreakResponse {
  success: true
  /** Dependent service ids impacted by the failure. */
  blastRadius: string[]
  incidentId: string
}

export interface ChaosRecoverResponse {
  success: true
  /** Always empty for recovery. */
  blastRadius: string[]
  /** Number of incidents resolved by recovery. */
  resolvedIncidents: number
}

export interface ChaosErrorResponse {
  success: false
  error: string
}

export type ChaosResponse = ChaosBreakResponse | ChaosRecoverResponse | ChaosErrorResponse
