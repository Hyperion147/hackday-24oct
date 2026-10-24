"use client"

import { useEffect, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { HeartPulse, RotateCcw, Upload, Zap } from "lucide-react"

import { ServiceCanvas } from "@/components/canvas/ServiceCanvas"
import { DiagramUploadModal } from "@/components/canvas/DiagramUploadModal"
import { IncidentFeed } from "@/components/incidents/IncidentFeed"
import { TelemetryStrip } from "@/components/telemetry/TelemetryStrip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePulseStore } from "@/store/usePulseStore"

function StatusPill() {
  const status = usePulseStore((state) => state.systemStatus())
  const impactedCount = usePulseStore((state) => state.nodes).filter(
    (node) => node.data.status !== "healthy",
  ).length

  if (status === "operational") {
    return (
      <Badge
        variant="outline"
        className="gap-2 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        All Systems Operational
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
        status === "degraded"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-red-500/40 bg-red-500/10 text-red-300",
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            status === "degraded" ? "bg-amber-400" : "bg-red-500",
          )}
        />
      </span>
      {status === "degraded" ? "Partial Degradation" : "Incident Active"}
      {impactedCount > 0 && ` · ${impactedCount} service${impactedCount === 1 ? "" : "s"} impacted`}
    </Badge>
  )
}

function TopNavbar() {
  const simulateRandomChaos = usePulseStore((state) => state.simulateRandomChaos)
  const restoreAll = usePulseStore((state) => state.restoreAll)
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/10 bg-slate-950/80 px-5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 shadow-[0_0_18px_-4px_rgba(56,189,248,0.5)]">
            <HeartPulse className="size-4 text-sky-400" />
          </span>
          <div className="leading-tight">
            <h1 className="font-heading text-sm font-semibold tracking-tight text-slate-100">StackPulse</h1>
            <p className="text-[10px] text-slate-500">API health · architecture · chaos simulation</p>
          </div>
        </div>

        <div className="mx-2 hidden h-6 w-px bg-white/10 sm:block" />

        <div className="hidden sm:block">
          <StatusPill />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200"
            onClick={() => setUploadOpen(true)}
          >
            <Upload data-icon="inline-start" />
            Import Diagram
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => simulateRandomChaos()}
          >
            <Zap data-icon="inline-start" />
            Simulate Random Chaos
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => restoreAll()}>
            <RotateCcw data-icon="inline-start" />
            Reset System
          </Button>
        </div>
      </header>

      <DiagramUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  )
}

export default function DashboardPage() {
  const tick = usePulseStore((state) => state.tick)

  // Drive live telemetry: latency jitter + rolling sparkline history.
  useEffect(() => {
    const timer = window.setInterval(() => tick(), 2_000)
    return () => window.clearInterval(timer)
  }, [tick])

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-slate-950 text-slate-200">
      <TopNavbar />

      <main className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <section className="relative min-h-0 border-white/10 xl:border-r">
          <ReactFlowProvider>
            <ServiceCanvas />
          </ReactFlowProvider>
        </section>
        <aside className="min-h-0 border-t border-white/10 xl:border-t-0">
          <IncidentFeed />
        </aside>
      </main>

      <footer className="h-64 shrink-0 border-t border-white/10">
        <TelemetryStrip />
      </footer>
    </div>
  )
}
