import { NextResponse, type NextRequest } from "next/server"

import { breakService, recoverProject } from "@/lib/chaos/chaos"
import { getServerCookieAdapter } from "@/lib/supabase/request"
import { SupabaseConfigError } from "@/lib/supabase/server"
import type {
  ChaosErrorResponse,
  ChaosRequest,
  ChaosResponse,
} from "@/types/chaos-outcome"

/**
 * Chaos / failure-injection endpoint.
 *
 * POST body: `{ serviceId, projectId, mode: "break" | "recover" }`
 *
 * - `break`    fails the target service, degrades its transitive dependents
 *              (the blast radius), and opens an incident record.
 * - `recover`  restores every service in the project to healthy telemetry and
 *              resolves all open incidents.
 *
 * Success responses: `{ success: true, blastRadius: string[], incidentId? }`.
 * All errors are `{ success: false, error: string }` with an appropriate status.
 *
 * This file is deliberately thin: HTTP concerns (validation, status mapping)
 * live here, while all database operations live in `lib/chaos/chaos.ts`, with
 * the request's cookie adapter bridged through `lib/supabase/request.ts`.
 */

/* -------------------------------------------------------------------------- */
/*  Request validation                                                         */
/* -------------------------------------------------------------------------- */

function parseChaosRequest(body: unknown): { ok: true; value: ChaosRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" }
  }
  const { serviceId, projectId, mode } = body as Record<string, unknown>
  if (typeof serviceId !== "string" || serviceId.trim().length === 0) {
    return { ok: false, error: "`serviceId` must be a non-empty string" }
  }
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    return { ok: false, error: "`projectId` must be a non-empty string" }
  }
  if (mode !== "break" && mode !== "recover") {
    return { ok: false, error: '`mode` must be either "break" or "recover"' }
  }
  return { ok: true, value: { serviceId, projectId, mode } }
}

/* -------------------------------------------------------------------------- */
/*  HTTP mapping helpers                                                       */
/* -------------------------------------------------------------------------- */

function failure(status: number, error: string): NextResponse<ChaosErrorResponse> {
  return NextResponse.json<ChaosErrorResponse>({ success: false, error }, { status })
}

const FAILURE_STATUS: Record<"not_found" | "database", 404 | 502> = {
  not_found: 404,
  database: 502,
}

/* -------------------------------------------------------------------------- */
/*  Route                                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest): Promise<NextResponse<ChaosResponse>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return failure(400, "Request body must be valid JSON")
  }

  const parsed = parseChaosRequest(body)
  if (!parsed.ok) {
    return failure(400, parsed.error)
  }

  try {
    const cookies = await getServerCookieAdapter()

    if (parsed.value.mode === "break") {
      const result = await breakService(cookies, parsed.value.projectId, parsed.value.serviceId)
      if (result.ok) {
        return NextResponse.json<ChaosResponse>({
          success: true,
          blastRadius: result.blastRadius,
          incidentId: result.incidentId,
        })
      }
      return failure(FAILURE_STATUS[result.reason], result.message)
    }

    const result = await recoverProject(cookies, parsed.value.projectId)
    if (result.ok) {
      return NextResponse.json<ChaosResponse>({
        success: true,
        blastRadius: result.blastRadius,
        resolvedIncidents: result.resolvedIncidents,
      })
    }
    return failure(FAILURE_STATUS[result.reason], result.message)
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      console.error("[api/chaos] supabase not configured:", error.message)
      return failure(503, "Supabase is not configured on the server")
    }
    console.error("[api/chaos] unexpected error:", error)
    return failure(500, "Unexpected server error")
  }
}
