import {
  createAdminServiceClient,
  type ServerCookieAdapter,
} from "@/lib/supabase/server"
import type { IncidentSeverity, IncidentStatus, ServiceType, ServiceUpdate } from "@/types/database"
import type {
  ChaosBreakResult,
  ChaosFailure,
  ChaosRecoverResult,
} from "@/types/chaos-outcome"

/**
 * Chaos simulation domain logic.
 *
 * Plain TypeScript domain logic returning structured results (no `next/*`
 * imports), which the HTTP layer maps to status codes. Keeps database access
 * testable outside of a request context.
 */

/* -------------------------------------------------------------------------- */
/*  Domain constants                                                           */
/* -------------------------------------------------------------------------- */

/** Latency assigned to a service broken by chaos mode. */
const BROKEN_LATENCY_MS = 9999
/** Upper bound for dependent latency after amplification. */
const MAX_LATENCY_MS = 9999
/** Multiplier applied to each impacted dependent's current latency. */
const DEGRADED_LATENCY_MULTIPLIER = 4
/** Standard healthy latency per service type, all < 60ms. */
const BASELINE_LATENCY_MS: Record<ServiceType, number> = {
  api: 40,
  database: 16,
  cache: 6,
  external: 45,
}

/** Remediation guidance surfaced in the AI diagnosis, per failing service type. */
const REMEDIATION_PLAYBOOK: Record<ServiceType, string[]> = {
  database: [
    "Promote the read replica and re-point the connection pool.",
    "Enable a circuit breaker on the data-access layer to fail fast.",
  ],
  cache: [
    "Promote the cache replica to primary and re-warm hot keys.",
    "Serve stale-while-revalidate until hit-rate recovers.",
  ],
  api: [
    "Enable the circuit breaker on the affected route so calls fail fast.",
    "Scale horizontally and shed low-priority traffic.",
  ],
  external: [
    "Route traffic to the secondary provider fallback.",
    "Queue outbound requests with exponential backoff (max 3 retries).",
  ],
}

/** Incidents that have not yet been resolved (real DB enum: active | resolved). */
const OPEN_STATUSES: readonly IncidentStatus[] = ["active"]
const LADDER: readonly IncidentSeverity[] = ["info", "warning", "critical"]

/* -------------------------------------------------------------------------- */
/*  Graph traversal                                                            */
/* -------------------------------------------------------------------------- */

interface BlastRadiusEntry {
  id: string
  depth: number
}

/**
 * Collects every service that transitively depends on `rootServiceId`.
 * Edges read `source → target` ("source calls target"), so dependents are
 * found by walking incoming edges from the root. Returned in BFS depth order.
 */
function computeBlastRadius(
  rootServiceId: string,
  edges: Array<{ source_id: string; target_id: string }>,
): BlastRadiusEntry[] {
  const impacted: BlastRadiusEntry[] = []
  const visited = new Set<string>([rootServiceId])
  let frontier: string[] = [rootServiceId]
  let depth = 0

  while (frontier.length > 0) {
    depth += 1
    const nextFrontier: string[] = []
    for (const current of frontier) {
      for (const edge of edges) {
        if (edge.target_id !== current || visited.has(edge.source_id)) continue
        visited.add(edge.source_id)
        impacted.push({ id: edge.source_id, depth })
        nextFrontier.push(edge.source_id)
      }
    }
    frontier = nextFrontier
  }
  return impacted
}

function severityFor(rootType: ServiceType, impactedCount: number): IncidentSeverity {
  // Ladder compressed onto the DB enum (info | warning | critical):
  // ≥2 impacted → critical, 1 → warning, 0 → info.
  const base: IncidentSeverity =
    impactedCount >= 2 ? "critical" : impactedCount === 1 ? "warning" : "info"
  const isCriticalInfra = rootType === "database" || rootType === "cache"
  if (isCriticalInfra && base !== "critical") {
    return LADDER[LADDER.indexOf(base) + 1]
  }
  return base
}

function buildDiagnosis(
  rootName: string,
  rootType: ServiceType,
  impactedNames: string[],
  severity: IncidentSeverity,
): string {
  const impactedList =
    impactedNames.length > 0 ? impactedNames.join(", ") : "no downstream services — contained blast radius"

  return [
    `Root cause: ${rootName} (${rootType}) is returning a 100% error rate with ${BROKEN_LATENCY_MS}ms p99 latency; health checks are failing on the primary instance pool.`,
    `Blast radius: ${impactedList}. Severity assessed as ${severity}; ${impactedNames.length} dependent service(s) reporting elevated latency and error rates.`,
    "Recommended remediation:",
    ...REMEDIATION_PLAYBOOK[rootType].map((step) => `• ${step}`),
  ].join("\n")
}

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

/** Breaks `serviceId` and degrades its transitive dependents. */
export async function breakService(
  cookies: ServerCookieAdapter,
  projectId: string,
  serviceId: string,
): Promise<ChaosBreakResult | ChaosFailure> {
  const supabase = await createAdminServiceClient(cookies)

  // 1. Load the root service.
  const { data: root, error: rootError } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("project_id", projectId)
    .maybeSingle()

  if (rootError) {
    console.error("[chaos] root fetch failed:", rootError.message)
    return { ok: false, reason: "database", message: `Failed to load the target service: ${rootError.message}` }
  }
  if (!root) {
    return { ok: false, reason: "not_found", message: `Service ${serviceId} was not found in project ${projectId}` }
  }

  // 2. Load the project graph and compute the blast radius.
  const { data: edges, error: edgesError } = await supabase
    .from("service_edges")
    .select("source_id, target_id")
    .eq("project_id", projectId)

  if (edgesError) {
    console.error("[chaos] edge fetch failed:", edgesError.message)
    return { ok: false, reason: "database", message: `Failed to load the dependency graph: ${edgesError.message}` }
  }

  const blastRadius = computeBlastRadius(serviceId, edges ?? [])
  const impactedIds = blastRadius.map((entry) => entry.id)

  // 3. Break the root service.
  const rootUpdate: ServiceUpdate = { status: "down", latency_ms: BROKEN_LATENCY_MS }
  const { error: breakError } = await supabase
    .from("services")
    .update(rootUpdate)
    .eq("id", serviceId)
    .eq("project_id", projectId)

  if (breakError) {
    console.error("[chaos] root update failed:", breakError.message)
    return { ok: false, reason: "database", message: `Failed to break the target service: ${breakError.message}` }
  }

  // 4. Degrade every dependent service.
  const impactedNames: string[] = []
  if (impactedIds.length > 0) {
    const { data: impactedRows, error: impactedFetchError } = await supabase
      .from("services")
      .select("id, name, latency_ms")
      .eq("project_id", projectId)
      .in("id", impactedIds)

    if (impactedFetchError) {
      console.error("[chaos] dependents fetch failed:", impactedFetchError.message)
      return { ok: false, reason: "database", message: `Failed to load dependents: ${impactedFetchError.message}` }
    }

    for (const row of impactedRows ?? []) {
      const amplified = Math.min(row.latency_ms * DEGRADED_LATENCY_MULTIPLIER, MAX_LATENCY_MS)
      const degradedUpdate: ServiceUpdate = { status: "degraded", latency_ms: amplified }
      const { error: degradeError } = await supabase.from("services").update(degradedUpdate).eq("id", row.id)

      if (degradeError) {
        console.error("[chaos] dependent update failed:", degradeError.message)
        return {
          ok: false,
          reason: "database",
          message: `Failed to degrade dependent service ${row.id}: ${degradeError.message}`,
        }
      }
      impactedNames.push(row.name)
    }
  }

  // 5. Open an incident with the root cause and impacted node IDs.
  const severity = severityFor(root.type, impactedIds.length)
  const { data: incident, error: incidentError } = await supabase
    .from("incidents")
    .insert({
      project_id: projectId,
      root_service_id: serviceId,
      impacted_service_ids: impactedIds,
      severity,
      status: "active",
      title: `${root.name} is down${impactedIds.length > 0 ? ` — ${impactedIds.length} service${impactedIds.length === 1 ? "" : "s"} impacted` : " (isolated)"}`,
      description: `${root.name} stopped responding to health checks. Cascade detected across: ${impactedNames.length > 0 ? impactedNames.join(", ") : "no dependents"}.`,
      ai_diagnosis: buildDiagnosis(root.name, root.type, impactedNames, severity),
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (incidentError) {
    console.error("[chaos] incident insert failed:", incidentError.message)
    return { ok: false, reason: "database", message: `Failed to record the incident: ${incidentError.message}` }
  }

  console.info(`[chaos] incident ${incident.id} opened: severity ${severity}, blast radius ${impactedIds.length}`)
  return { ok: true, blastRadius: impactedIds, incidentId: incident.id }
}

/** Restores every service in the project and resolves open incidents. */
export async function recoverProject(
  cookies: ServerCookieAdapter,
  projectId: string,
): Promise<ChaosRecoverResult | ChaosFailure> {
  const supabase = await createAdminServiceClient(cookies)

  // 1. Reset every service to healthy telemetry (latency < 60ms).
  const { data: services, error: fetchError } = await supabase
    .from("services")
    .select("id, type")
    .eq("project_id", projectId)

  if (fetchError) {
    console.error("[chaos] services fetch failed:", fetchError.message)
    return { ok: false, reason: "database", message: `Failed to load project services: ${fetchError.message}` }
  }

  // Batch one update per service type: each type restores to its own baseline.
  const idsByType = new Map<ServiceType, string[]>()
  for (const service of services ?? []) {
    const ids = idsByType.get(service.type) ?? []
    ids.push(service.id)
    idsByType.set(service.type, ids)
  }

  for (const [type, ids] of idsByType) {
    const recoveryUpdate: ServiceUpdate = {
      status: "healthy",
      latency_ms: BASELINE_LATENCY_MS[type],
    }
    const { error: resetError } = await supabase
      .from("services")
      .update(recoveryUpdate)
      .eq("project_id", projectId)
      .in("id", ids)

    if (resetError) {
      console.error("[chaos] service reset failed:", resetError.message)
      return { ok: false, reason: "database", message: `Failed to reset ${type} services: ${resetError.message}` }
    }
  }

  // 2. Resolve every open incident.
  const { data: resolved, error: resolveError } = await supabase
    .from("incidents")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .in("status", OPEN_STATUSES)
    .select("id")

  if (resolveError) {
    console.error("[chaos] incident resolution failed:", resolveError.message)
    return { ok: false, reason: "database", message: `Failed to resolve incidents: ${resolveError.message}` }
  }

  return { ok: true, blastRadius: [], resolvedIncidents: resolved?.length ?? 0 }
}
