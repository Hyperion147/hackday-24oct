"use client"

import { useState, useEffect, useCallback } from "react"
import { Sparkles, Siren, Wrench, Shield, Copy, Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { formatTimestamp } from "@/lib/format-time"
import { usePulseStore } from "@/store/usePulseStore"
import type { Incident, IncidentSeverity, ServiceStatus, ServiceType } from "@/types/pulse"
import type { GemmaDiagnosis, RemediationStep } from "@/types/gemma"

const SEVERITY_TONE: Record<IncidentSeverity, string> = {
  low: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
}

const SEVERITY_DOT: Record<ServiceStatus, string> = {
  healthy: "bg-emerald-400",
  degraded: "bg-amber-400",
  down: "bg-red-500",
}

const TYPE_LABEL: Record<ServiceType, string> = {
  api: "API",
  db: "Database",
  cache: "Cache",
  external: "External",
}

const PRIORITY_TONE: Record<RemediationStep["priority"], string> = {
  immediate: "bg-red-500/15 text-red-300 border-red-500/30",
  "short-term": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "long-term": "bg-sky-500/15 text-sky-300 border-sky-500/30",
}

interface IncidentDrawerProps {
  incident: Incident | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Small copy-to-clipboard button that shows "Copied!" for 2 seconds. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
      aria-label="Copy code snippet"
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-400" />
          <span className="text-emerald-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy
        </>
      )}
    </button>
  )
}

/**
 * Full root-cause-analysis drawer for a single incident:
 * root service, blast radius (live statuses), and AI remediation.
 */
export function IncidentDrawer({ incident, open, onOpenChange }: IncidentDrawerProps) {
  const nodes = usePulseStore((state) => state.nodes)
  const edges = usePulseStore((state) => state.edges)

  const [diagnosis, setDiagnosis] = useState<GemmaDiagnosis | null>(null)
  const [diagnosisLoading, setDiagnosisLoading] = useState(false)
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null)
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set())

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const rootService = incident ? nodeById.get(incident.rootServiceId) : undefined

  // When drawer opens and incident changes, fetch diagnosis
  useEffect(() => {
    if (!open || !incident) return
    setDiagnosis(null)
    setDiagnosisLoading(true)
    setDiagnosisError(null)
    setCheckedSteps(new Set())

    const topology = edges.map((e) => ({ source: e.source, target: e.target }))

    fetch("/api/gemma/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rootService: incident.rootServiceId,
        blastRadius: incident.impactedServiceIds,
        topology,
      }),
    })
      .then((r) => r.json())
      .then((data: GemmaDiagnosis | { error: string }) => {
        if ("error" in data) {
          setDiagnosisError(data.error)
        } else {
          setDiagnosis(data)
        }
      })
      .catch((err: Error) => setDiagnosisError(err.message))
      .finally(() => setDiagnosisLoading(false))
  }, [open, incident, edges])

  const toggleStep = (index: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-white/10 bg-slate-950/95 backdrop-blur-xl sm:max-w-md [&>button]:!text-slate-400"
      >
        {incident && (
          <div className="flex min-h-0 flex-col">
            <SheetHeader className="gap-2 border-b border-white/10 px-5 py-4 text-left">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wide", SEVERITY_TONE[incident.severity])}
                >
                  {incident.severity}
                </Badge>
                <span className="font-mono text-[11px] text-slate-500">
                  {incident.id} · {formatTimestamp(incident.timestamp)}
                </span>
              </div>
              <SheetTitle className="flex items-start gap-2 font-heading text-base leading-snug text-slate-100">
                <Siren className="mt-0.5 size-4 shrink-0 text-red-400" />
                {incident.title}
              </SheetTitle>
              <SheetDescription className="text-xs leading-relaxed text-slate-400">
                {incident.description}
              </SheetDescription>
              {/* Gemma 4 header badge */}
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="gap-1.5 border-violet-500/30 bg-violet-500/10 text-violet-300 text-[11px] px-2.5 py-1">
                  <Sparkles className="size-3" />
                  Diagnosed by Gemma 4 (Open Weights)
                </Badge>
              </div>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5">
              {/* Root service */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Root Service
                </h3>
                <div className="flex items-center gap-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3.5 py-3">
                  <span className="relative flex size-2.5">
                    <span
                      className={cn(
                        "inline-flex size-2.5 rounded-full",
                        SEVERITY_DOT[rootService?.data.status ?? "down"],
                      )}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {rootService?.data.name ?? incident.rootServiceId}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {rootService ? TYPE_LABEL[rootService.data.type] : "unknown"} ·{" "}
                      {rootService ? `${Math.round(rootService.data.latencyMs)}ms p99` : "offline"}
                    </p>
                  </div>
                  <span className="ml-auto font-mono text-xs text-red-300">
                    err {(rootService?.data.errorRate ?? 100).toFixed(0)}%
                  </span>
                </div>
              </section>

              {/* Blast radius */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Blast Radius · {incident.impactedServiceIds.length} dependent
                  {incident.impactedServiceIds.length === 1 ? "" : "s"}
                </h3>
                {incident.impactedServiceIds.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-xs text-slate-400">
                    Contained blast radius — no downstream consumers were impacted.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {incident.impactedServiceIds.map((serviceId) => {
                      const node = nodeById.get(serviceId)
                      return (
                        <span
                          key={serviceId}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300"
                        >
                          <span
                            className={cn("size-2 rounded-full", SEVERITY_DOT[node?.data.status ?? "degraded"])}
                          />
                          {node?.data.name ?? serviceId}
                        </span>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* AI Diagnosis (Gemma 4) */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <Sparkles className="size-3.5 text-violet-400" />
                  AI Diagnosis
                </h3>

                {/* Loading skeleton */}
                {diagnosisLoading && (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-white/5 rounded w-3/4" />
                    <div className="h-4 bg-white/5 rounded w-full" />
                    <div className="h-4 bg-white/5 rounded w-2/3" />
                  </div>
                )}

                {/* Error state — fall back to legacy aiDiagnosis */}
                {!diagnosisLoading && (diagnosisError || !diagnosis) && (
                  <div className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-500/5 p-4">
                    {diagnosisError && (
                      <p className="mb-2 text-[11px] text-red-400">
                        Gemma 4 unavailable — showing cached analysis.
                      </p>
                    )}
                    {incident.aiDiagnosis.split("\n").map((line, index) => {
                      if (line.startsWith("•")) {
                        return (
                          <p key={index} className="flex items-start gap-2 text-xs leading-relaxed text-slate-300">
                            <Wrench className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
                            {line.replace(/^•\s*/, "")}
                          </p>
                        )
                      }
                      if (line.startsWith("Recommended remediation")) {
                        return (
                          <p key={index} className="text-[11px] font-semibold tracking-wide text-violet-300 uppercase">
                            {line}
                          </p>
                        )
                      }
                      return (
                        <p key={index} className="text-xs leading-relaxed text-slate-300">
                          {line}
                        </p>
                      )
                    })}
                  </div>
                )}

                {/* Successful Gemma 4 diagnosis */}
                {!diagnosisLoading && diagnosis && (
                  <div className="space-y-3">
                    {/* Summary */}
                    <p className="text-xs leading-relaxed text-slate-400">{diagnosis.summary}</p>

                    {/* Root Cause card */}
                    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3.5">
                      <p className="mb-1 text-[10px] font-semibold tracking-widest text-violet-400 uppercase">
                        Root Cause
                      </p>
                      <p className="text-xs leading-relaxed text-slate-300">{diagnosis.rootCause}</p>
                    </div>

                    {/* Blast Radius Analysis card */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3.5">
                      <p className="mb-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                        Blast Radius Analysis
                      </p>
                      <p className="text-xs leading-relaxed text-slate-300">{diagnosis.blastRadiusExplanation}</p>
                    </div>

                    {/* Remediation Checklist */}
                    {diagnosis.remediationSteps.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3.5">
                        <p className="mb-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                          Remediation Checklist
                        </p>
                        <ul className="space-y-4">
                          {diagnosis.remediationSteps.map((step, index) => (
                            <li key={index} className="flex items-start gap-2.5">
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={checkedSteps.has(index)}
                                onChange={() => toggleStep(index)}
                                className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-violet-500"
                                aria-label={`Mark "${step.title}" as done`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span
                                    className={cn(
                                      "text-[10px] font-medium leading-none",
                                      checkedSteps.has(index) ? "line-through text-slate-500" : "text-slate-200",
                                    )}
                                  >
                                    {step.title}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded border px-1.5 py-0 text-[9px] leading-4",
                                      PRIORITY_TONE[step.priority],
                                    )}
                                  >
                                    {step.priority}
                                  </Badge>
                                </div>
                                <p
                                  className={cn(
                                    "text-[11px] leading-relaxed",
                                    checkedSteps.has(index) ? "text-slate-600" : "text-slate-400",
                                  )}
                                >
                                  {step.description}
                                </p>
                                {step.codeSnippet && (
                                  <div className="mt-2 rounded-md bg-slate-900 border border-white/10 overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
                                      <span className="text-[10px] text-slate-500 font-mono">snippet</span>
                                      <CopyButton text={step.codeSnippet} />
                                    </div>
                                    <pre className="overflow-x-auto px-3 py-2.5">
                                      <code className="font-mono text-[11px] leading-relaxed text-slate-300">
                                        {step.codeSnippet}
                                      </code>
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Guardrail Recommendation */}
                    <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                      <Shield className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                      <div>
                        <p className="mb-1 text-[10px] font-semibold tracking-widest text-emerald-400 uppercase">
                          Guardrail Recommendation
                        </p>
                        <p className="text-xs leading-relaxed text-slate-300">{diagnosis.guardrailRecommendation}</p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
