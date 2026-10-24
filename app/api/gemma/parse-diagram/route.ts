import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Required for Buffer and FormData support in Next.js App Router. */
export const runtime = "nodejs"

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** A single service or component identified in the architecture diagram. */
interface ParsedService {
  id: string
  name: string
  type: "api" | "database" | "cache" | "external"
  position: { x: number; y: number }
}

/** A directed connection between two services in the architecture diagram. */
interface ParsedEdge {
  id: string
  source: string
  target: string
  relation: "sync" | "async"
}

/** The full structured response returned by this endpoint. */
interface ParseDiagramResponse {
  services: ParsedService[]
  edges: ParsedEdge[]
  error?: string
}

/* -------------------------------------------------------------------------- */
/*  Prompt                                                                     */
/* -------------------------------------------------------------------------- */

const PARSE_DIAGRAM_PROMPT = `You are an expert software architect. Analyze this architecture diagram image and extract ALL services/components and their connections.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "services": [
    {
      "id": "unique-kebab-case-id",
      "name": "Human-readable service name",
      "type": "api" | "database" | "cache" | "external",
      "position": { "x": number, "y": number }
    }
  ],
  "edges": [
    {
      "id": "edge-source-target",
      "source": "source-service-id",
      "target": "target-service-id",
      "relation": "sync" | "async"
    }
  ]
}

Rules:
- type must be one of: api, database, cache, external
- relation: use "async" for message queues/events, "sync" for direct HTTP/RPC calls
- positions: distribute services across a 1200x800 canvas
- Every edge id, source, and target must reference valid service ids`

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Strips markdown code fences (e.g. ```json ... ```) that the model may wrap
 * around its JSON output, then returns the raw JSON string.
 */
function extractJsonFromText(text: string): string {
  // Remove optional language tag after opening fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }
  return text.trim()
}

/**
 * Graceful fallback response — used when the API key is missing or the model
 * call fails. Returns an empty diagram with an error message so the UI never
 * crashes on a non-2xx response.
 */
function fallback(error: string): NextResponse<ParseDiagramResponse> {
  return NextResponse.json<ParseDiagramResponse>({ services: [], edges: [], error })
}

/* -------------------------------------------------------------------------- */
/*  Route                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/gemma/parse-diagram
 *
 * Accepts `multipart/form-data` with a single `image` field (PNG or JPG).
 * Sends the image to Gemma 4 via the Google GenAI SDK and asks it to return a
 * structured JSON description of every service and connection visible in the
 * architecture diagram.
 *
 * Response: `{ services: ParsedService[], edges: ParsedEdge[], error?: string }`
 *
 * Errors are returned as HTTP 200 with an empty diagram and an `error` field so
 * that the client can display a graceful fallback instead of crashing.
 * The only exception is a missing image field, which returns HTTP 400.
 */
export async function POST(request: NextRequest): Promise<NextResponse<ParseDiagramResponse>> {
  // ── 1. Guard: API key must be configured ──────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[api/gemma/parse-diagram] GEMINI_API_KEY is not configured")
    return fallback("GEMINI_API_KEY is not configured")
  }

  // ── 2. Parse multipart form data ──────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error("[api/gemma/parse-diagram] Failed to parse form data:", err)
    return NextResponse.json<ParseDiagramResponse>(
      { services: [], edges: [], error: "Failed to parse multipart/form-data" },
      { status: 400 },
    )
  }

  const imageFile = formData.get("image") as File | null
  if (!imageFile) {
    return NextResponse.json<ParseDiagramResponse>(
      { services: [], edges: [], error: "No image provided" },
      { status: 400 },
    )
  }

  // ── 3. Convert the image to base64 ────────────────────────────────────────
  const arrayBuffer = await imageFile.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  const mimeType = imageFile.type || "image/png"

  // ── 4. Call Gemma 4 ───────────────────────────────────────────────────────
  let rawText: string
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    const response = await ai.models.generateContent({
      model: "gemma-4",
      contents: [
        {
          role: "user",
          parts: [
            { text: PARSE_DIAGRAM_PROMPT },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    })

    rawText = response.text ?? ""
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/gemma/parse-diagram] Gemma call failed:", message)
    return fallback(`Gemma API error: ${message}`)
  }

  // ── 5. Parse the JSON response ────────────────────────────────────────────
  try {
    const jsonString = extractJsonFromText(rawText)
    const parsed = JSON.parse(jsonString) as ParseDiagramResponse

    return NextResponse.json<ParseDiagramResponse>({
      services: parsed.services ?? [],
      edges: parsed.edges ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/gemma/parse-diagram] Failed to parse model JSON:", message, "\nRaw text:", rawText)
    return fallback(`Failed to parse model response as JSON: ${message}`)
  }
}
