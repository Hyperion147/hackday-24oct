"use client"

import { useMemo } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import "@xyflow/react/dist/style.css"

import { ServiceNode } from "@/components/canvas/ServiceNode"
import { usePulseStore } from "@/store/usePulseStore"
import type { ServiceFlowEdge, ServiceFlowNode, ServiceStatus } from "@/types/pulse"

const nodeTypes: NodeTypes = {
  service: ServiceNode,
}

function edgeTone(isDark: boolean): Record<ServiceStatus, { stroke: string; animated: boolean }> {
  return {
    healthy: {
      stroke: isDark ? "rgba(148,163,184,0.30)" : "rgba(100,116,139,0.45)",
      animated: false,
    },
    degraded: {
      stroke: isDark ? "rgba(251,191,36,0.75)" : "rgba(217,119,6,0.70)",
      animated: true,
    },
    down: {
      stroke: isDark ? "rgba(239,68,68,0.85)" : "rgba(220,38,38,0.80)",
      animated: true,
    },
  }
}

/** The worse of two statuses, used for edge colouring. */
function worstStatus(a: ServiceStatus | undefined, b: ServiceStatus | undefined): ServiceStatus {
  if (a === "down" || b === "down") return "down"
  if (a === "degraded" || b === "degraded") return "degraded"
  return "healthy"
}

function minimapNodeColor(node: ServiceFlowNode, isDark: boolean): string {
  if (node.data.status === "down") return isDark ? "#ef4444" : "#dc2626"
  if (node.data.status === "degraded") return isDark ? "#fbbf24" : "#d97706"
  return isDark ? "#34d399" : "#059669"
}

export function ServiceCanvas() {
  const nodes = usePulseStore((state) => state.nodes)
  const edges = usePulseStore((state) => state.edges)
  const onNodesChange = usePulseStore((state) => state.onNodesChange)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const edgePalette = useMemo(() => edgeTone(isDark), [isDark])

  const nodeStatusById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.data.status])),
    [nodes],
  )

  const styledEdges = useMemo<ServiceFlowEdge[]>(
    () =>
      edges.map((edge) => {
        const tone = edgePalette[
          worstStatus(nodeStatusById.get(edge.source), nodeStatusById.get(edge.target))
        ]
        return {
          ...edge,
          animated: tone.animated,
          style: { stroke: tone.stroke, strokeWidth: 2 },
        }
      }),
    [edges, nodeStatusById, edgePalette],
  )

  return (
    <div className="h-full w-full">
      <ReactFlow<ServiceFlowNode, Edge>
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        minZoom={0.25}
        maxZoom={1.6}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color={isDark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.28)"} />
        <Controls className="!rounded-lg !border !border-border !bg-card/90 [&_button]:!fill-muted-foreground [&_button]:!stroke-muted-foreground [&_button:hover]:!bg-muted" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => minimapNodeColor(node as ServiceFlowNode, isDark)}
          maskColor={isDark ? "rgba(2,6,23,0.75)" : "rgba(248,250,252,0.85)"}
          className="!rounded-lg !border !border-border !bg-background/90"
        />
        <Panel position="top-left">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> Healthy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" /> Degraded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-500" /> Down
            </span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}
