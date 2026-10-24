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
import "@xyflow/react/dist/style.css"

import { ServiceNode } from "@/components/canvas/ServiceNode"
import { usePulseStore } from "@/store/usePulseStore"
import type { ServiceFlowEdge, ServiceFlowNode, ServiceStatus } from "@/types/pulse"

const nodeTypes: NodeTypes = {
  service: ServiceNode,
}

const EDGE_TONE: Record<ServiceStatus, { stroke: string; animated: boolean }> = {
  healthy: { stroke: "rgba(148,163,184,0.30)", animated: false },
  degraded: { stroke: "rgba(251,191,36,0.75)", animated: true },
  down: { stroke: "rgba(239,68,68,0.85)", animated: true },
}

/** The worse of two statuses, used for edge colouring. */
function worstStatus(a: ServiceStatus | undefined, b: ServiceStatus | undefined): ServiceStatus {
  if (a === "down" || b === "down") return "down"
  if (a === "degraded" || b === "degraded") return "degraded"
  return "healthy"
}

const MINIMAP_NODE_COLOR = (node: ServiceFlowNode): string => {
  if (node.data.status === "down") return "#ef4444"
  if (node.data.status === "degraded") return "#fbbf24"
  return "#34d399"
}

export function ServiceCanvas() {
  const nodes = usePulseStore((state) => state.nodes)
  const edges = usePulseStore((state) => state.edges)
  const onNodesChange = usePulseStore((state) => state.onNodesChange)

  const nodeStatusById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.data.status])),
    [nodes],
  )

  const styledEdges = useMemo<ServiceFlowEdge[]>(
    () =>
      edges.map((edge) => {
        const tone = EDGE_TONE[
          worstStatus(nodeStatusById.get(edge.source), nodeStatusById.get(edge.target))
        ]
        return {
          ...edge,
          animated: tone.animated,
          style: { stroke: tone.stroke, strokeWidth: 2 },
        }
      }),
    [edges, nodeStatusById],
  )

  return (
    <div className="h-full w-full">
      <ReactFlow<ServiceFlowNode, Edge>
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.4}
        maxZoom={1.8}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgba(148,163,184,0.18)" />
        <Controls className="!rounded-lg !border !border-white/10 !bg-slate-900/80 [&_button]:!fill-slate-300 [&_button]:!stroke-slate-300 [&_button:hover]:!bg-white/10" />
        <MiniMap
          pannable
          zoomable
          nodeColor={MINIMAP_NODE_COLOR}
          maskColor="rgba(2,6,23,0.75)"
          className="!rounded-lg !border !border-white/10 !bg-slate-950/80"
        />
        <Panel position="top-left">
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400" /> Healthy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-400" /> Degraded
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
