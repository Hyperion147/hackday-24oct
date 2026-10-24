"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, ChevronRight, Radio, ShieldCheck, Siren } from "lucide-react"

import { IncidentDrawer } from "@/components/incidents/IncidentDrawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/format-time"
import { usePulseStore } from "@/store/usePulseStore"
import type { Incident, IncidentSeverity } from "@/types/pulse"

const SEVERITY_TONE: Record<IncidentSeverity, string> = {
  low: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
}

function IncidentItem({
  incident,
  onOpen,
  now,
}: {
  incident: Incident
  onOpen: () => void
  now: number
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn("rounded-md border px-1.5 py-0 text-[10px] tracking-wide uppercase", SEVERITY_TONE[incident.severity])}
        >
          {incident.severity}
        </Badge>
        <span className="font-mono text-[10px] text-slate-500">{formatRelativeTime(incident.timestamp, now)}</span>
        <ChevronRight className="ml-auto size-4 text-slate-600" />
      </div>
      <p className="mt-1.5 text-sm leading-snug font-medium text-slate-200">{incident.title}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{incident.aiDiagnosis}</p>
    </button>
  )
}

/**
 * Right-hand panel: live incident feed. Selecting an incident opens the
 * AI root-cause-analysis drawer.
 */
export function IncidentFeed() {
  const incidents = usePulseStore((state) => state.incidents)
  const nodes = usePulseStore((state) => state.nodes)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Keep "2m ago" labels fresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const selected = incidents.find((incident) => incident.id === selectedId) ?? null

  const openIncident = useCallback((id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }, [])

  const openLatest = useCallback(() => {
    const latest = incidents[0]
    if (!latest) return
    setSelectedId(latest.id)
    setDrawerOpen(true)
  }, [incidents])

  const unhealthyCount = nodes.filter((node) => node.data.status !== "healthy").length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Siren className="size-4 text-red-400" />
        <h2 className="text-sm font-semibold text-slate-200">Incident Feed</h2>
        <Badge variant="outline" className="ml-1 rounded-md border-white/15 bg-white/5 px-1.5 py-0 font-mono text-[10px] text-slate-400">
          {incidents.length}
        </Badge>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto gap-1 text-violet-300 hover:bg-violet-500/10 hover:text-violet-200"
          onClick={openLatest}
          disabled={incidents.length === 0}
        >
          <Bot data-icon="inline-start" />
          AI analysis
        </Button>
      </div>

      {(incidents.length > 0 || unhealthyCount > 0) && (
        <div
          className={cn(
            "flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5 text-xs",
            unhealthyCount > 0 ? "bg-red-500/5 text-red-300" : "bg-emerald-500/5 text-emerald-300",
          )}
        >
          <Radio className="size-3.5 shrink-0" />
          <span>
            {unhealthyCount > 0
              ? `${unhealthyCount} service${unhealthyCount === 1 ? "" : "s"} currently impacted — cascading failure detected by the dependency graph.`
              : "All services reporting healthy telemetry."}
          </span>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {incidents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/10 px-6 py-12 text-center">
              <ShieldCheck className="size-8 text-emerald-400/70" />
              <p className="text-sm font-medium text-slate-300">No incidents on record</p>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Chaos simulation events will generate incidents with AI root-cause analysis here.
              </p>
            </div>
          ) : (
            incidents.map((incident) => (
              <IncidentItem
                key={incident.id}
                incident={incident}
                now={now}
                onOpen={() => openIncident(incident.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <IncidentDrawer incident={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}
