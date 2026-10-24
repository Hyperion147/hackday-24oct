"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  Database,
  Server,
  Shield,
  Wrench,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePulseStore } from "@/store/usePulseStore"
import type {
  ServiceFlowNode,
  ServiceStatus,
  ServiceType,
} from "@/types/pulse"

const TYPE_ICON: Record<ServiceType, LucideIcon> = {
  api: Server,
  db: Database,
  cache: Zap,
  external: Shield,
}

const TYPE_LABEL: Record<ServiceType, string> = {
  api: "API",
  db: "Database",
  cache: "Cache",
  external: "External",
}

interface StatusStyle {
  border: string
  glow: string
  dot: string
  ping: boolean
  text: string
  label: string
}

const STATUS_STYLE: Record<ServiceStatus, StatusStyle> = {
  healthy: {
    border: "border-emerald-400/30",
    glow: "shadow-[0_0_18px_-4px_rgba(52,211,153,0.35)]",
    dot: "bg-emerald-400",
    ping: true,
    text: "text-emerald-300",
    label: "Healthy",
  },
  degraded: {
    border: "border-amber-400/50",
    glow: "shadow-[0_0_22px_-2px_rgba(251,191,36,0.45)]",
    dot: "bg-amber-400",
    ping: true,
    text: "text-amber-300",
    label: "Degraded",
  },
  down: {
    border: "border-red-500/60",
    glow: "shadow-[0_0_28px_-2px_rgba(239,68,68,0.55)]",
    dot: "bg-red-500",
    ping: false,
    text: "text-red-300",
    label: "Down",
  },
}

/** Latency badge colour: green < 50ms, amber < 300ms, red ≥ 300ms. */
function latencyTone(latencyMs: number): string {
  if (latencyMs < 50) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
  if (latencyMs < 300) return "bg-amber-500/15 text-amber-300 border-amber-500/30"
  return "bg-red-500/15 text-red-300 border-red-500/30"
}

function ServiceNodeComponent({ id, data, selected }: NodeProps<ServiceFlowNode>) {
  const simulateOutage = usePulseStore((state) => state.simulateOutage)
  const recoverService = usePulseStore((state) => state.recoverService)

  const Icon = TYPE_ICON[data.type]
  const status = STATUS_STYLE[data.status]
  const isDown = data.status === "down"

  return (
    <div
      className={cn(
        "w-60 rounded-xl border bg-slate-900/80 backdrop-blur-md transition-shadow duration-500",
        status.border,
        status.glow,
        selected && "ring-2 ring-sky-400/60",
      )}
    >
      {/* Connection points */}
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-slate-600 !bg-slate-900"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-slate-600 !bg-slate-900"
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-white/5 px-3.5 pt-3 pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <Icon className={cn("size-4", status.text)} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-medium text-slate-100">{data.name}</p>
          <p className="text-[11px] leading-tight text-slate-500">{TYPE_LABEL[data.type]}</p>
        </div>
        <span className="relative ml-auto flex size-2.5 shrink-0">
          {status.ping && (
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                status.dot,
              )}
            />
          )}
          <span className={cn("relative inline-flex size-2.5 rounded-full", status.dot)} />
        </span>
      </div>

      {/* Telemetry row */}
      <div className="flex items-center gap-1.5 px-3.5 py-2.5">
        <Badge
          variant="outline"
          className={cn("rounded-md border px-1.5 py-0 font-mono text-[11px] tabular-nums", latencyTone(data.latencyMs))}
        >
          {Math.round(data.latencyMs)}ms
        </Badge>
        <span className="font-mono text-[11px] tabular-nums text-slate-400">
          err {data.errorRate.toFixed(1)}%
        </span>
        <span className={cn("ml-auto text-[11px] font-medium", status.text)}>{status.label}</span>
      </div>

      {/* Action */}
      <div className="px-3.5 pb-3">
        <Button
          variant={isDown ? "secondary" : "destructive"}
          size="xs"
          className="nodrag nopan w-full"
          onClick={(event) => {
            event.stopPropagation()
            if (isDown) {
              recoverService(id)
            } else {
              simulateOutage(id)
            }
          }}
        >
          {isDown ? <Wrench data-icon="inline-start" /> : <ZapOff data-icon="inline-start" />}
          {isDown ? "Recover" : "Break Service"}
        </Button>
      </div>
    </div>
  )
}

/** Memoised so React Flow only re-renders nodes whose data actually changed. */
export const ServiceNode = memo(ServiceNodeComponent)
