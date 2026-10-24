"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type {
  Incident,
  Service,
  ServiceEdge,
} from "@/types/database"

export interface RealtimeTopologyState {
  services: Service[]
  edges: ServiceEdge[]
  incidents: Incident[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: RealtimeTopologyState = {
  services: [],
  edges: [],
  incidents: [],
  loading: true,
  error: null,
}

function replaceById<T extends { id: string }>(list: T[], row: T): T[] {
  const index = list.findIndex((item) => item.id === row.id)
  if (index === -1) return [...list, row]
  const next = [...list]
  next[index] = row
  return next
}

/**
 * Subscribes the dashboard to live topology data for one project.
 *
 * Initial snapshot: `services`, `service_edges`, and active (`open`/`acknowledged`)
 * `incidents`. Then a `realtime-topology` channel keeps the feed in sync:
 * - `UPDATE`/`INSERT` on `public.services`  → status + latency updates
 * - `INSERT`/`UPDATE` on `public.incidents` → incident feed updates
 *
 * Resolving an incident removes it from the active feed. The channel is
 * removed on unmount or project change.
 */
export function useRealtimeTopology(projectId: string): RealtimeTopologyState {
  const [state, setState] = useState<RealtimeTopologyState>(INITIAL_STATE)
  // Guard against setState-from-realtime after unmount or project switch.
  const activeRef = useRef(true)
  activeRef.current = true

  const supabase = useMemo(() => getSupabaseBrowserClient(), [])

  useEffect(() => {
    if (!projectId) {
      setState({ ...INITIAL_STATE, loading: false, error: "projectId is required" })
      return
    }
    if (!supabase) {
      setState({
        ...INITIAL_STATE,
        loading: false,
        error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL or anon key)",
      })
      return
    }

    activeRef.current = true

    const applyFetchError = (label: string, error: Error | null): void => {
      console.error(`[useRealtimeTopology] failed to load ${label}`, error?.message)
      setState((prev) => ({ ...prev, error: `Failed to load ${label}: ${error?.message ?? "unknown error"}` }))
    }

    let channel: RealtimeChannel | undefined

    const subscribe = (): void => {
      channel = supabase
        .channel("realtime-topology")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "services" },
          (payload: RealtimePostgresChangesPayload<Service>) => {
            if (payload.eventType === "UPDATE") {
              const row = payload.new
              setState((prev) => ({
                ...prev,
                services: prev.services.map((service) => (service.id === row.id ? row : service)),
              }))
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "services" },
          (payload: RealtimePostgresChangesPayload<Service>) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new
              setState((prev) => ({
                ...prev,
                services: replaceById(prev.services, row),
              }))
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "incidents" },
          (payload: RealtimePostgresChangesPayload<Incident>) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new
              setState((prev) => ({
                ...prev,
                incidents: replaceById(prev.incidents, row),
              }))
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "incidents" },
          (payload: RealtimePostgresChangesPayload<Incident>) => {
            if (payload.eventType === "UPDATE") {
              const row = payload.new
              setState((prev) => ({
                ...prev,
                // Resolved incidents leave the active feed.
                incidents:
                  row.status === "resolved"
                    ? prev.incidents.filter((incident) => incident.id !== row.id)
                    : replaceById(prev.incidents, row),
              }))
            }
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[useRealtimeTopology] channel status: ${status}`)
            if (activeRef.current) {
              setState((prev) => ({ ...prev, error: `Realtime channel error: ${status}` }))
            }
          }
        })
    }

    const bootstrap = (): void => {
      void (async () => {
        const [servicesResult, edgesResult, incidentsResult] = await Promise.all([
          supabase.from("services").select("*").eq("project_id", projectId).order("name"),
          supabase.from("service_edges").select("*").eq("project_id", projectId),
          supabase.from("incidents").select("*").eq("project_id", projectId).in("status", ["open", "acknowledged"]),
        ])

        if (!activeRef.current) return

        if (servicesResult.error) {
          applyFetchError("services", servicesResult.error)
        }
        if (edgesResult.error) {
          applyFetchError("edges", edgesResult.error)
        }
        if (incidentsResult.error) {
          applyFetchError("incidents", incidentsResult.error)
        }

        setState({
          services: servicesResult.data ?? [],
          edges: edgesResult.data ?? [],
          incidents: incidentsResult.data ?? [],
          loading: false,
          error:
            servicesResult.error || edgesResult.error || incidentsResult.error
              ? "One or more Supabase queries failed"
              : null,
        })

        subscribe()
      })()
    }

    bootstrap()

    return () => {
      activeRef.current = false
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [projectId, supabase])

  return state
}
