import { applyNodeChanges } from "@xyflow/react"
import type { NodeChange } from "@xyflow/react"
import { create } from "zustand"

import type {
  Incident,
  IncidentSeverity,
  PulseSystemStatus,
  ServiceFlowEdge,
  ServiceFlowNode,
  ServiceNodeData,
  ServiceStatus,
  ServiceType,
} from "@/types/pulse"

/* -------------------------------------------------------------------------- */
/*  Seed architecture                                                          */
/* -------------------------------------------------------------------------- */

interface ServiceSeed {
  id: string
  name: string
  type: ServiceType
  baselineLatencyMs: number
  baselineErrorRate: number
  position: { x: number; y: number }
  /** Probability mass of bad days in the 90-day history. */
  degradedDays: number
  downDays: number
}

const SERVICE_SEEDS: ServiceSeed[] = [
  {
    id: "web-storefront",
    name: "Web Storefront",
    type: "api",
    baselineLatencyMs: 38,
    baselineErrorRate: 0.2,
    position: { x: 60, y: 200 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "api-gateway",
    name: "API Gateway",
    type: "api",
    baselineLatencyMs: 42,
    baselineErrorRate: 0.3,
    position: { x: 280, y: 200 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "auth-service",
    name: "Auth Service",
    type: "api",
    baselineLatencyMs: 36,
    baselineErrorRate: 0.3,
    position: { x: 520, y: 60 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "user-profile-service",
    name: "User Profile Service",
    type: "api",
    baselineLatencyMs: 44,
    baselineErrorRate: 0.3,
    position: { x: 520, y: 140 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "catalog-service",
    name: "Catalog Service",
    type: "api",
    baselineLatencyMs: 41,
    baselineErrorRate: 0.3,
    position: { x: 520, y: 260 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "cart-service",
    name: "Cart Service",
    type: "api",
    baselineLatencyMs: 39,
    baselineErrorRate: 0.3,
    position: { x: 520, y: 340 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "checkout-service",
    name: "Checkout Service",
    type: "api",
    baselineLatencyMs: 48,
    baselineErrorRate: 0.5,
    position: { x: 740, y: 340 },
    degradedDays: 2,
    downDays: 0,
  },
  {
    id: "payment-service",
    name: "Payment Service",
    type: "external",
    baselineLatencyMs: 55,
    baselineErrorRate: 1.0,
    position: { x: 960, y: 380 },
    degradedDays: 2,
    downDays: 1,
  },
  {
    id: "order-service",
    name: "Order Service",
    type: "api",
    baselineLatencyMs: 46,
    baselineErrorRate: 0.4,
    position: { x: 960, y: 300 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "search-service",
    name: "Search Service",
    type: "api",
    baselineLatencyMs: 52,
    baselineErrorRate: 0.4,
    position: { x: 520, y: 440 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "recommendation-service",
    name: "Recommendation Service",
    type: "api",
    baselineLatencyMs: 62,
    baselineErrorRate: 0.5,
    position: { x: 740, y: 440 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "redis-session-cache",
    name: "Redis Session Cache",
    type: "cache",
    baselineLatencyMs: 5,
    baselineErrorRate: 0.1,
    position: { x: 740, y: 60 },
    degradedDays: 1,
    downDays: 0,
  },
  {
    id: "postgres-primary-db",
    name: "Postgres Primary DB",
    type: "db",
    baselineLatencyMs: 14,
    baselineErrorRate: 0.1,
    position: { x: 960, y: 200 },
    degradedDays: 1,
    downDays: 0,
  },
]

/** Edge semantics: source depends on target (traffic flows source -> target). */
const EDGE_SEEDS: Array<{ source: string; target: string; label?: string }> = [
  { source: "web-storefront", target: "api-gateway" },
  { source: "api-gateway", target: "auth-service" },
  { source: "api-gateway", target: "user-profile-service" },
  { source: "api-gateway", target: "catalog-service" },
  { source: "api-gateway", target: "cart-service" },
  { source: "api-gateway", target: "search-service" },
  { source: "cart-service", target: "checkout-service" },
  { source: "checkout-service", target: "payment-service" },
  { source: "checkout-service", target: "order-service" },
  { source: "search-service", target: "recommendation-service" },
  { source: "auth-service", target: "redis-session-cache" },
  { source: "user-profile-service", target: "postgres-primary-db" },
  { source: "catalog-service", target: "postgres-primary-db" },
  { source: "cart-service", target: "postgres-primary-db" },
  { source: "order-service", target: "postgres-primary-db" },
]

/* -------------------------------------------------------------------------- */
/*  Deterministic pseudo-random utilities (SSR-safe seeding)                    */
/* -------------------------------------------------------------------------- */

/** mulberry32 – small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Builds a 90-day availability series (0–100) with rare degraded/down days. */
function buildUptime90d(seed: ServiceSeed): number[] {
  const rand = mulberry32(hashSeed(seed.id))
  const series: number[] = []
  for (let i = 0; i < 90; i += 1) {
    const roll = rand()
    if (roll < seed.downDays / 90) {
      series.push(Math.round((55 + rand() * 25) * 10) / 10)
    } else if (roll < (seed.downDays + seed.degradedDays) / 90) {
      series.push(Math.round((93 + rand() * 5.5) * 10) / 10)
    } else {
      series.push(Math.round((99.85 + rand() * 0.15) * 100) / 100)
    }
  }
  return series
}

function buildBaselineNodes(): ServiceFlowNode[] {
  return SERVICE_SEEDS.map((seed) => ({
    id: seed.id,
    type: "service" as const,
    position: seed.position,
    data: {
      id: seed.id,
      name: seed.name,
      type: seed.type,
      status: "healthy" as const,
      latencyMs: seed.baselineLatencyMs,
      errorRate: seed.baselineErrorRate,
      uptime90d: buildUptime90d(seed),
    },
  }))
}

function buildBaselineEdges(): ServiceFlowEdge[] {
  return EDGE_SEEDS.map((edge) => ({
    id: `edge-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
  }))
}

const BASELINE_BY_ID = new Map(SERVICE_SEEDS.map((seed) => [seed.id, seed]))

/* -------------------------------------------------------------------------- */
/*  Graph helpers                                                              */
/* -------------------------------------------------------------------------- */

interface ImpactedService {
  id: string
  /** Hops between the impacted service and the failing root. */
  depth: number
}

/**
 * Collects every service that depends on `rootId`, directly or indirectly.
 * Edges read `source -> target` ("source calls target"), so dependents are
 * found by walking incoming edges from the root.
 */
function collectDependents(rootId: string, edges: ServiceFlowEdge[]): ImpactedService[] {
  const dependents: ImpactedService[] = []
  const visited = new Set<string>([rootId])
  let frontier: string[] = [rootId]
  let depth = 0

  while (frontier.length > 0) {
    depth += 1
    const nextFrontier: string[] = []
    for (const current of frontier) {
      for (const edge of edges) {
        if (edge.target !== current || visited.has(edge.source)) continue
        visited.add(edge.source)
        dependents.push({ id: edge.source, depth })
        nextFrontier.push(edge.source)
      }
    }
    frontier = nextFrontier
  }
  return dependents
}

/** Direct dependencies of a service (targets of its outgoing edges). */
function directDependenciesOf(serviceId: string, edges: ServiceFlowEdge[]): string[] {
  return edges.filter((edge) => edge.source === serviceId).map((edge) => edge.target)
}

/**
 * Status of a service given the statuses of its direct dependencies:
 * every dependency down -> down; any down/degraded dependency -> degraded.
 */
function deriveStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.length === 0) return "healthy"
  if (statuses.every((status) => status === "down")) return "down"
  if (statuses.some((status) => status !== "healthy")) return "degraded"
  return "healthy"
}

const LATENCY_MULTIPLIER: Record<ServiceStatus, number> = {
  healthy: 1,
  degraded: 5.5,
  down: 22,
}

/* -------------------------------------------------------------------------- */
/*  AI diagnosis generator                                                     */
/* -------------------------------------------------------------------------- */

const TYPE_LABEL: Record<ServiceType, string> = {
  api: "API",
  db: "primary datastore",
  cache: "shared cache",
  external: "third-party dependency",
}

const REMEDIATION: Record<ServiceType, string[]> = {
  db: [
    "Promote the read replica to primary and re-point the connection pool.",
    "Enable a circuit breaker (half-open probes) on /api/checkout to fail fast.",
    "Freeze background migrations and enqueue writes to a dead-letter queue.",
  ],
  cache: [
    "Promote the Redis replica to primary and re-warm hot keys.",
    "Serve stale-while-revalidate on cache misses to absorb the outage.",
    "Throttle non-critical sessions until hit-rate recovers above 90%.",
  ],
  api: [
    "Enable the circuit breaker on the affected route so calls fail fast.",
    "Scale the service horizontally and shed low-priority traffic via load-shedding headers.",
    "Pin the deploy to the last known-good release while investigating.",
  ],
  external: [
    "Route traffic to the secondary provider fallback and verify contract parity.",
    "Queue outbound requests with exponential backoff (max 3 retries).",
    "Surface a degraded-mode banner instead of hard-failing user flows.",
  ],
}

function buildDiagnosis(
  root: ServiceNodeData,
  impacted: ServiceNodeData[],
  severity: IncidentSeverity,
): string {
  const steps = REMEDIATION[root.type]
  const impactedList =
    impacted.length > 0
      ? impacted.map((service) => service.name).join(", ")
      : "no downstream services — contained blast radius"

  return [
    `Root cause: ${root.name} (${TYPE_LABEL[root.type]}) is returning a ${(root.errorRate).toFixed(0)}% error rate with ${Math.round(root.latencyMs)}ms p99 latency. Health checks are failing on the primary instance pool.`,
    `Blast radius: ${impactedList}. Severity assessed as ${severity}; ${impacted.length} dependent service(s) currently experiencing elevated latency and error rates.`,
    `Recommended remediation:`,
    ...steps.map((step) => `• ${step}`),
    `Next step: watch error-rate recovery for 10 minutes after remediation, then auto-close the incident if p99 returns under ${Math.round((BASELINE_BY_ID.get(root.id)?.baselineLatencyMs ?? 100) * 2)}ms.`,
  ].join("\n")
}

function buildSeverity(root: ServiceNodeData, impactedCount: number): IncidentSeverity {
  const base: IncidentSeverity =
    impactedCount >= 4 ? "critical" : impactedCount >= 2 ? "high" : impactedCount === 1 ? "medium" : "low"
  const isCriticalInfra = root.type === "db" || root.type === "cache"
  if (isCriticalInfra && base !== "critical") {
    const ladder: IncidentSeverity[] = ["low", "medium", "high", "critical"]
    return ladder[ladder.indexOf(base) + 1]
  }
  return base
}

function incidentCounterToId(counter: number): string {
  return `INC-${String(counter).padStart(4, "0")}`
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                      */
/* -------------------------------------------------------------------------- */

export interface PulseState {
  nodes: ServiceFlowNode[]
  edges: ServiceFlowEdge[]
  incidents: Incident[]
  /** Rolling window of average system latency (ms), one sample per tick. */
  latencyHistory: number[]
  incidentCounter: number

  /** Takes a healthy/degraded service down and propagates the blast radius. */
  simulateOutage: (serviceId: string) => void
  /** Recovers a service; dependent statuses are re-derived from dependencies. */
  recoverService: (serviceId: string) => void
  /** Breaks a random non-down service. */
  simulateRandomChaos: () => void
  /** Restores every node to healthy baseline telemetry. */
  restoreAll: () => void
  /** Advances live telemetry one step (jitter + rolling latency history). */
  tick: () => void
  /** Applies React Flow node changes (drag/position) back into the store. */
  onNodesChange: (changes: NodeChange<ServiceFlowNode>[]) => void
  /** Derived: overall system status for the navbar pill. */
  systemStatus: () => PulseSystemStatus
  /** Derived: current availability percentage, e.g. 99.8. */
  availability: () => number
  /**
   * Replaces the canvas with a parsed diagram from the Gemma 4 architecture
   * parser. Resets incidents and telemetry history to a clean state.
   */
  loadDiagram: (nodes: ServiceFlowNode[], edges: ServiceFlowEdge[]) => void
}

const INITIAL_NODES = buildBaselineNodes()
const INITIAL_EDGES = buildBaselineEdges()
const INITIAL_LATENCY_HISTORY: number[] = (() => {
  const rand = mulberry32(1337)
  const avg = SERVICE_SEEDS.reduce((sum, seed) => sum + seed.baselineLatencyMs, 0) / SERVICE_SEEDS.length
  return Array.from({ length: 60 }, () => Math.round(avg * (0.9 + rand() * 0.2) * 10) / 10)
})()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const usePulseStore = create<PulseState>()((set, get) => ({
  nodes: INITIAL_NODES,
  edges: INITIAL_EDGES,
  incidents: [],
  latencyHistory: INITIAL_LATENCY_HISTORY,
  incidentCounter: 1,

  simulateOutage: (serviceId) => {
    const { nodes, edges, incidents, incidentCounter } = get()
    const rootNode = nodes.find((node) => node.id === serviceId)
    if (!rootNode || rootNode.data.status === "down") return

    const impacted = collectDependents(serviceId, edges)
    const statusById = new Map<string, ServiceStatus>([[serviceId, "down"]])
    const depthById = new Map(impacted.map((entry) => [entry.id, entry.depth]))
    const currentStatusById = new Map(nodes.map((node) => [node.id, node.data.status]))
    const severity = buildSeverity(rootNode.data, impacted.length)

    // Phase 1 — derive statuses in BFS depth order so each dependent reads the
    // post-outage status of every dependency in its blast-radius path.
    for (const { id } of impacted) {
      const dependencyStatuses = directDependenciesOf(id, edges).map(
        (depId) => statusById.get(depId) ?? currentStatusById.get(depId) ?? "healthy",
      )
      statusById.set(id, deriveStatus(dependencyStatuses))
    }

    // Phase 2 — apply new metrics to the root and every impacted service.
    const nextNodes = nodes.map((node) => {
      const nextStatus = statusById.get(node.id)
      const baseline = BASELINE_BY_ID.get(node.id)
      if (nextStatus === undefined || !baseline) return node

      if (node.id === serviceId) {
        return {
          ...node,
          data: {
            ...node.data,
            status: "down" as const,
            latencyMs: Math.round(clamp(baseline.baselineLatencyMs * LATENCY_MULTIPLIER.down, 0, 9_999) * 10) / 10,
            errorRate: 100,
          },
        }
      }

      const depth = depthById.get(node.id) ?? 1
      const latency =
        nextStatus === "down"
          ? baseline.baselineLatencyMs * LATENCY_MULTIPLIER.down
          : baseline.baselineLatencyMs * LATENCY_MULTIPLIER.degraded * (1 + depth * 0.15)

      return {
        ...node,
        data: {
          ...node.data,
          status: nextStatus,
          latencyMs: Math.round(clamp(latency, 0, 9_999) * 10) / 10,
          errorRate: nextStatus === "down" ? 100 : clamp(12 + depth * 6, 0, 60),
        },
      }
    })

    const impactedData = impacted
      .map((entry) => nextNodes.find((node) => node.id === entry.id)?.data)
      .filter((data): data is ServiceNodeData => data !== undefined)

    const incident: Incident = {
      id: incidentCounterToId(incidentCounter),
      rootServiceId: serviceId,
      impactedServiceIds: impacted.map((entry) => entry.id),
      severity,
      title: `${rootNode.data.name} is down${impacted.length > 0 ? ` — ${impacted.length} service${impacted.length === 1 ? "" : "s"} impacted` : " (isolated)"}`,
      description: `${rootNode.data.name} (${TYPE_LABEL[rootNode.data.type]}) stopped responding to health checks at ${new Date().toLocaleTimeString()}. ${impacted.length > 0 ? `Dependent services are reporting cascading latency: ${impactedData.map((data) => data.name).join(", ")}.` : "No downstream consumers were affected."}`,
      aiDiagnosis: buildDiagnosis(rootNode.data, impactedData, severity),
      timestamp: new Date().toISOString(),
    }

    set({
      nodes: nextNodes,
      incidents: [incident, ...incidents].slice(0, 20),
      incidentCounter: incidentCounter + 1,
    })
  },

  recoverService: (serviceId) => {
    const { nodes, edges } = get()
    const rootNode = nodes.find((node) => node.id === serviceId)
    if (!rootNode || rootNode.data.status === "healthy") return

    const currentStatusById = new Map(nodes.map((node) => [node.id, node.data.status]))
    const statusById = new Map<string, ServiceStatus>()
    const dependents = collectDependents(serviceId, edges)

    // Re-derive the recovered root from its own dependencies, then walk the
    // blast radius in BFS order so dependents heal top-down as well.
    const rootDependencyStatuses = directDependenciesOf(serviceId, edges).map(
      (depId) => statusById.get(depId) ?? currentStatusById.get(depId) ?? "healthy",
    )
    statusById.set(serviceId, deriveStatus(rootDependencyStatuses))

    for (const { id } of dependents) {
      const dependencyStatuses = directDependenciesOf(id, edges).map(
        (depId) => statusById.get(depId) ?? currentStatusById.get(depId) ?? "healthy",
      )
      statusById.set(id, deriveStatus(dependencyStatuses))
    }

    const nextNodes = nodes.map((node) => {
      const baseline = BASELINE_BY_ID.get(node.id)
      const nextStatus = statusById.get(node.id)
      if (!baseline || nextStatus === undefined) return node
      return {
        ...node,
        data: {
          ...node.data,
          status: nextStatus,
          latencyMs:
            nextStatus === "healthy"
              ? baseline.baselineLatencyMs
              : Math.round(baseline.baselineLatencyMs * LATENCY_MULTIPLIER.degraded * 10) / 10,
          errorRate: nextStatus === "healthy" ? baseline.baselineErrorRate : 24,
        },
      }
    })

    set({ nodes: nextNodes })
  },

  simulateRandomChaos: () => {
    const { nodes, simulateOutage } = get()
    const candidates = nodes.filter((node) => node.data.status !== "down")
    if (candidates.length === 0) return
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    simulateOutage(target.id)
  },

  restoreAll: () => {
    set({ nodes: buildBaselineNodes() })
  },

  tick: () => {
    const { nodes, latencyHistory } = get()
    let latencySum = 0
    let latencyCount = 0

    const nextNodes = nodes.map((node) => {
      const baseline = BASELINE_BY_ID.get(node.id)
      if (!baseline) return node
      const { status } = node.data

      const spread = status === "down" ? 0.08 : 0.22
      const multiplier = LATENCY_MULTIPLIER[status]
      const latencyMs =
        status === "down"
          ? clamp(baseline.baselineLatencyMs * multiplier * (0.9 + Math.random() * 0.25), 0, 9_999)
          : clamp(baseline.baselineLatencyMs * multiplier * (1 - spread + Math.random() * spread * 2), 1, 9_999)

      const errorRate =
        status === "down"
          ? clamp(96 + Math.random() * 4, 0, 100)
          : status === "degraded"
            ? clamp(node.data.errorRate + (Math.random() - 0.5) * 6, 8, 60)
            : clamp(baseline.baselineErrorRate * (0.6 + Math.random() * 0.8), 0, 5)

      if (status !== "down") {
        latencySum += latencyMs
        latencyCount += 1
      }

      return {
        ...node,
        data: { ...node.data, latencyMs: Math.round(latencyMs * 10) / 10, errorRate },
      }
    })

    const average = latencyCount > 0 ? latencySum / latencyCount : latencyHistory[latencyHistory.length - 1] ?? 0
    const nextHistory = [...latencyHistory, Math.round(average * 10) / 10].slice(-60)

    set({ nodes: nextNodes, latencyHistory: nextHistory })
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  systemStatus: () => {
    const { nodes } = get()
    if (nodes.some((node) => node.data.status === "down")) return "incident"
    if (nodes.some((node) => node.data.status === "degraded")) return "degraded"
    return "operational"
  },

  availability: () => {
    const { nodes } = get()
    const penalty = nodes.reduce((sum, node) => {
      if (node.data.status === "down") return sum + 4
      if (node.data.status === "degraded") return sum + 0.7
      return sum
    }, 0)
    return Math.max(0, Math.round((99.99 - penalty) * 100) / 100)
  },

  loadDiagram: (nodes, edges) => {
    const rand = mulberry32(Date.now() >>> 0)
    const avg = 80
    const freshHistory = Array.from({ length: 60 }, () =>
      Math.round(avg * (0.9 + rand() * 0.2) * 10) / 10,
    )
    set({ nodes, edges, incidents: [], incidentCounter: 0, latencyHistory: freshHistory })
  },
}))

/** Convenience selector: current telemetry for a single service. */
export function useServiceData(serviceId: string): ServiceNodeData | undefined {
  return usePulseStore((state) => state.nodes.find((node) => node.id === serviceId)?.data)
}
