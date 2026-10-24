"use client"

import * as React from "react"
import { useCallback, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { usePulseStore } from "@/store/usePulseStore"
import type { ServiceFlowEdge, ServiceFlowNode, ServiceType } from "@/types/pulse"

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DiagramUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ParsedService {
  id: string
  name: string
  type: "api" | "database" | "cache" | "external"
  position: { x: number; y: number }
}

interface ParsedEdge {
  id: string
  source: string
  target: string
  relation: "sync" | "async"
}

interface ParseDiagramResponse {
  services: ParsedService[]
  edges: ParsedEdge[]
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg"] as const

const TYPE_MAP: Record<string, ServiceType> = {
  api: "api",
  database: "db",
  cache: "cache",
  external: "external",
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function mapToServiceFlowNode(service: ParsedService): ServiceFlowNode {
  return {
    id: service.id,
    type: "service",
    position: service.position,
    data: {
      id: service.id,
      name: service.name,
      type: TYPE_MAP[service.type] ?? "api",
      status: "healthy",
      latencyMs: 50,
      errorRate: 0.1,
      uptime90d: Array.from({ length: 90 }, () => 99 + Math.random()),
    },
  }
}

function mapToServiceFlowEdge(parsedEdge: ParsedEdge): ServiceFlowEdge {
  return {
    id: parsedEdge.id,
    source: parsedEdge.source,
    target: parsedEdge.target,
    label: parsedEdge.relation === "async" ? "async" : undefined,
  }
}

function isAcceptedMimeType(type: string): type is (typeof ACCEPTED_MIME_TYPES)[number] {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(type)
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function DiagramUploadModal({ open, onOpenChange }: DiagramUploadModalProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ------------------------------------------------------------------ */
  /*  Drag-and-drop handlers                                             */
  /* ------------------------------------------------------------------ */

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!isAcceptedMimeType(file.type)) {
      setErrorMessage("Only PNG and JPEG images are supported.")
      return
    }

    setErrorMessage(null)
    setSelectedFile(file)
  }, [])

  /* ------------------------------------------------------------------ */
  /*  File input fallback                                                */
  /* ------------------------------------------------------------------ */

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isAcceptedMimeType(file.type)) {
      setErrorMessage("Only PNG and JPEG images are supported.")
      return
    }

    setErrorMessage(null)
    setSelectedFile(file)
  }, [])

  const handleDropzoneClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /* ------------------------------------------------------------------ */
  /*  Upload & parse                                                     */
  /* ------------------------------------------------------------------ */

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return

    setStatus("loading")
    setErrorMessage(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)

      const response = await fetch("/api/gemma/parse-diagram", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed with status ${response.status}`)
      }

      const data = (await response.json()) as ParseDiagramResponse

      const nodes = data.services.map(mapToServiceFlowNode)
      const edges = data.edges.map(mapToServiceFlowEdge)

      usePulseStore.setState({ nodes, edges })

      setStatus("success")

      // Close after a brief success flash
      setTimeout(() => {
        onOpenChange(false)
        // Reset state after the dialog animation completes
        setTimeout(() => {
          setStatus("idle")
          setSelectedFile(null)
          setErrorMessage(null)
        }, 300)
      }, 1200)
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred."
      setErrorMessage(message)
      setStatus("error")
    }
  }, [selectedFile, onOpenChange])

  /* ------------------------------------------------------------------ */
  /*  Dialog close (user-initiated)                                      */
  /* ------------------------------------------------------------------ */

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (status === "loading") return // prevent closing while parsing
      onOpenChange(nextOpen)
      if (!nextOpen) {
        setTimeout(() => {
          setStatus("idle")
          setSelectedFile(null)
          setErrorMessage(null)
          setIsDragActive(false)
        }, 300)
      }
    },
    [status, onOpenChange],
  )

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
            "duration-150",
          )}
        />

        {/* Panel */}
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border bg-card shadow-2xl",
            "flex flex-col gap-0 p-6 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            "duration-200",
          )}
        >
          {/* Header */}
          <div className="mb-5">
            <DialogPrimitive.Title className="text-base font-semibold text-white">
              Import Architecture Diagram
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
              Upload a screenshot or hand-drawn diagram. Gemma&nbsp;4 will parse it into your live
              canvas.
            </DialogPrimitive.Description>
          </div>

          {/* Dropzone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Click or drag and drop an image to upload"
            onClick={handleDropzoneClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleDropzoneClick()
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center gap-3",
              "rounded-lg border-2 border-dashed px-6 py-10 text-center",
              "transition-colors duration-150 select-none",
              isDragActive
                ? "border-sky-400/60 bg-sky-500/5"
                : "border-border hover:border-foreground/40 hover:bg-muted/30",
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-full",
                isDragActive ? "bg-sky-500/15" : "bg-muted/50",
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn("size-6", isDragActive ? "text-sky-500" : "text-muted-foreground")}
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            {/* Label */}
            <div>
              <p className={cn("text-sm font-medium", isDragActive ? "text-sky-600" : "text-foreground/80")}>
                {isDragActive ? "Drop to upload" : "Drag & drop your diagram"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                or <span className="text-sky-500 underline underline-offset-2">click to browse</span>
                &ensp;·&ensp;PNG or JPEG
              </p>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              onChange={handleFileInputChange}
            />
          </div>

          {/* Selected file preview */}
          {selectedFile && status !== "success" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0 text-sky-500"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="truncate text-sm text-foreground/80">{selectedFile.name}</span>
              <button
                type="button"
                aria-label="Remove selected file"
                className="ml-auto shrink-0 text-muted-foreground transition-colors hover:text-foreground/80"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Loading badge */}
          {status === "loading" && (
            <div className="mt-3 flex items-center justify-center">
              <span
                className={cn(
                  "animate-pulse inline-flex items-center gap-1.5 rounded-full",
                  "border border-violet-500/30 bg-violet-500/10 px-3 py-1",
                  "text-xs font-medium text-violet-600",
                )}
              >
                ✦ Gemma 4 is synthesizing your system graph…
              </span>
            </div>
          )}

          {/* Success indicator */}
          {status === "success" && (
            <div className="mt-3 flex items-center justify-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full",
                  "border border-emerald-500/30 bg-emerald-500/10 px-3 py-1",
                  "text-xs font-medium text-emerald-600",
                )}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Canvas updated — closing…
              </span>
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <p className="mt-3 text-center text-xs text-red-500">{errorMessage}</p>
          )}

          {/* Footer actions */}
          <div className="mt-5 flex items-center justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={status === "loading"}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
            </DialogPrimitive.Close>

            <Button
              size="sm"
              disabled={!selectedFile || status === "loading" || status === "success"}
              onClick={handleUpload}
              className={cn(
                "bg-sky-500 text-white hover:bg-sky-400",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {status === "loading" ? "Parsing…" : "Parse Diagram"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
