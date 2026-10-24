"use client"

import { useMemo } from "react"
import { Activity, Gauge } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { usePulseStore } from "@/store/usePulseStore"
import type { ServiceStatus } from "@/types/pulse"

/** Downdetector-style bucket for a single availability sample. */
function uptimeBarTone(value: number): string {
  if (value >= 95) return "bg-emerald-500"
  if (value >= 80) return "bg-amber-500"
  return "bg-red-500"
}

const STATUS_DOT: Record<ServiceStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
}

const STATUS_TEXT: Record<ServiceStatus, string> = {
  healthy: "text-emerald-600",
  degraded: "text-amber-600",
  down: "text-red-600",
}

function UptimeBars() {
  const nodes = usePulseStore((state) => state.nodes)

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2.5 pr-3">
        {nodes.map((node) => (
          <div key={node.id} className="flex items-center gap-3">
            <span className="relative flex size-2 shrink-0">
              <span className={cn("inline-flex size-2 rounded-full", STATUS_DOT[node.data.status])} />
            </span>
            <span className="w-44 shrink-0 truncate text-xs text-foreground/80">{node.data.name}</span>
            <div
              className="flex min-w-0 flex-1 items-center gap-[2px]"
              role="img"
              aria-label={`90-day uptime for ${node.data.name}`}
            >
              {node.data.uptime90d.map((sample, index) => (
                <span
                  key={index}
                  title={`Day -${89 - index}: ${sample}%`}
                  className={cn("h-5 w-[3px] shrink-0 rounded-[1px] sm:w-[4px]", uptimeBarTone(sample))}
                />
              ))}
            </div>
            <span
              className={cn(
                "w-14 shrink-0 text-right font-mono text-[11px] tabular-nums",
                STATUS_TEXT[node.data.status],
              )}
            >
              {Math.round(node.data.latencyMs)}ms
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

function LatencySparkline() {
  const latencyHistory = usePulseStore((state) => state.latencyHistory)

  const data = useMemo(
    () => latencyHistory.map((latency, index) => ({ index, latency })),
    [latencyHistory],
  )

  const current = latencyHistory[latencyHistory.length - 1] ?? 0
  const peak = latencyHistory.reduce((max, latency) => Math.max(max, latency), 0)

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-28 shrink-0 flex-col justify-center gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Avg latency</p>
          <p className="font-mono text-xl font-medium tabular-nums text-sky-600">
            {Math.round(current)}
            <span className="text-xs text-muted-foreground">ms</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Session peak</p>
          <p className="font-mono text-sm font-medium tabular-nums text-foreground/80">
            {Math.round(peak)}ms
          </p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]} />
            <Tooltip
              contentStyle={{
                background: "rgba(2,6,23,0.9)",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ display: "none" }}
              formatter={(value) => [`${Math.round(Number(value))}ms`, "avg latency"]}
            />
            <Area
              type="monotone"
              dataKey="latency"
              stroke="#38bdf8"
              strokeWidth={1.8}
              fill="url(#latencyFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TelemetryStrip() {
  const availability = usePulseStore((state) => state.availability())
  const nodes = usePulseStore((state) => state.nodes)
  const degradedCount = nodes.filter((node) => node.data.status !== "healthy").length

  const availabilityTone =
    availability >= 99.5 ? "text-emerald-600" : availability >= 97 ? "text-amber-600" : "text-red-600"

  return (
    <Card className="gap-3 rounded-none border-x-0 border-b-0 bg-background/60 py-3">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm text-foreground">
          <Gauge className="size-4 text-sky-500" />
          System Telemetry
        </CardTitle>
        <CardAction>
          <div className="text-right">
            <p className={cn("font-mono text-2xl leading-none font-semibold tabular-nums", availabilityTone)}>
              {availability.toFixed(2)}%
            </p>
            <p className="text-[11px] text-muted-foreground">
              availability · {degradedCount === 0 ? "all nodes nominal" : `${degradedCount} node(s) impacted`}
            </p>
          </div>
        </CardAction>
        <CardDescription className="sr-only">Per-service uptime history and live latency</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        <Tabs defaultValue="uptime" className="flex h-full min-h-0 flex-col gap-2">
          <TabsList className="w-fit">
            <TabsTrigger value="uptime" className="gap-1.5">
              <Activity data-icon="inline-start" />
              Uptime · 90d
            </TabsTrigger>
            <TabsTrigger value="latency" className="gap-1.5">
              <Gauge data-icon="inline-start" />
              Live latency
            </TabsTrigger>
          </TabsList>
          <TabsContent value="uptime" className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <UptimeBars />
          </TabsContent>
          <TabsContent value="latency" className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <LatencySparkline />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
