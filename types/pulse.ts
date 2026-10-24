import type { Edge, Node } from "@xyflow/react"

/** Categories of services rendered on the dependency canvas. */
export type ServiceType = "api" | "db" | "cache" | "external"

/** Health of a single service. */
export type ServiceStatus = "healthy" | "degraded" | "down"

/**
 * Data payload carried by every node on the React Flow canvas.
 * Extends `Record<string, unknown>` as required by @xyflow/react's `Node` type.
 */
export interface ServiceNodeData extends Record<string, unknown> {
  id: string
  name: string
  type: ServiceType
  status: ServiceStatus
  /** Current round-trip latency in milliseconds (jitters over time). */
  latencyMs: number
  /** Current request error rate, 0–100. */
  errorRate: number
  /** 90 daily availability samples (0–100) for the Downdetector-style bars. */
  uptime90d: number[]
}

/** A canvas node: React Flow node typed with our custom service data. */
export type ServiceFlowNode = Node<ServiceNodeData, "service">

/** Canvas edges (service A depends on B: source -> target). */
export type ServiceFlowEdge = Edge

/** Severity ladder for generated incidents. */
export type IncidentSeverity = "low" | "medium" | "high" | "critical"

/** Roll-up status of the whole system, shown in the navbar pill. */
export type PulseSystemStatus = "operational" | "degraded" | "incident"

/** Auto-generated incident record produced by chaos simulation. */
export interface Incident {
  id: string
  /** The service that originally failed. */
  rootServiceId: string
  /** Transitive dependents impacted by the root failure. */
  impactedServiceIds: string[]
  severity: IncidentSeverity
  title: string
  description: string
  /** AI-generated root-cause analysis + remediation steps (newline separated). */
  aiDiagnosis: string
  /** ISO-8601 creation time. */
  timestamp: string
}
