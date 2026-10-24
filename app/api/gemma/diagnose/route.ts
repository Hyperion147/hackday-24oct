import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopologyEdge {
  source: string
  target: string
}

interface DiagnoseRequest {
  rootService: string
  blastRadius: string[]
  topology: TopologyEdge[]
}

interface RemediationStep {
  title: string
  description: string
  codeSnippet?: string
  priority: 'immediate' | 'short-term' | 'long-term'
}

interface DiagnosisResult {
  summary: string
  rootCause: string
  blastRadiusExplanation: string
  remediationSteps: RemediationStep[]
  guardrailRecommendation: string
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the SRE diagnosis prompt from incident data.
 *
 * @param rootService  - The service that originally failed.
 * @param blastRadius  - Downstream services impacted by the failure.
 * @param topology     - Directed edges that describe the service dependency graph.
 * @returns The full prompt string to send to Gemma.
 */
function buildPrompt(
  rootService: string,
  blastRadius: string[],
  topology: TopologyEdge[],
): string {
  return `You are an SRE expert diagnosing a production incident in a microservices system.

INCIDENT DATA:
- Root service (failed): ${rootService}
- Blast radius (impacted services): ${blastRadius.join(', ') || 'none'}
- Topology edges: ${JSON.stringify(topology)}

Analyze this incident and return ONLY valid JSON (no markdown, no explanation):
{
  "summary": "1-2 sentence executive summary of what happened",
  "rootCause": "Technical explanation of the root cause",
  "blastRadiusExplanation": "Why these specific services were impacted (cascade path)",
  "remediationSteps": [
    {
      "title": "Step title",
      "description": "What to do and why",
      "codeSnippet": "Optional code/config snippet (e.g. circuit breaker, rate limiter)",
      "priority": "immediate" | "short-term" | "long-term"
    }
  ],
  "guardrailRecommendation": "Key architectural guardrail to prevent recurrence"
}

Requirements:
- Provide 3-5 remediation steps
- Include at least one code snippet (e.g., circuit breaker middleware, retry logic, rate limiter)
- The guardrailRecommendation should be a concrete architectural pattern
- Be specific and technical, not generic`
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

/**
 * Robustly extracts a JSON object from a model response string.
 * Strips surrounding markdown code fences (e.g. ```json … ```) if present.
 *
 * @param raw - Raw text returned by the model.
 * @returns Parsed JSON value.
 * @throws {SyntaxError} if no valid JSON can be extracted.
 */
function extractJson(raw: string): unknown {
  // Strip markdown code fences: ```json … ``` or ``` … ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim()
  return JSON.parse(candidate)
}

// ---------------------------------------------------------------------------
// Mock fallback
// ---------------------------------------------------------------------------

/**
 * Returns a realistic mock {@link DiagnosisResult} used when
 * `GEMINI_API_KEY` is not configured in the environment.
 *
 * @param rootService - The name of the failed root service.
 * @param blastRadius - Downstream services that were impacted.
 */
function getMockDiagnosis(
  rootService: string,
  blastRadius: string[],
): DiagnosisResult {
  const mockDiagnosis: DiagnosisResult = {
    summary: `${rootService} experienced a critical failure, cascading to ${blastRadius.length} downstream service(s).`,
    rootCause: `${rootService} stopped responding to health checks, likely due to resource exhaustion or a dependency timeout.`,
    blastRadiusExplanation: `Services ${blastRadius.join(', ')} depend on ${rootService} synchronously. When ${rootService} went down, requests backed up, causing cascading timeouts.`,
    remediationSteps: [
      {
        title: 'Enable Circuit Breaker',
        description:
          'Wrap calls to the failed service with a circuit breaker to fail fast and prevent cascade.',
        codeSnippet: `// Example using opossum circuit breaker\nconst CircuitBreaker = require('opossum')\nconst breaker = new CircuitBreaker(asyncFn, {\n  timeout: 3000,\n  errorThresholdPercentage: 50,\n  resetTimeout: 30000\n})\nbreaker.fallback(() => 'fallback response')`,
        priority: 'immediate' as const,
      },
      {
        title: 'Add Rate Limiting',
        description:
          'Protect the recovering service from thundering herd with rate limiting.',
        codeSnippet: `// Next.js middleware rate limiting\nimport { Ratelimit } from '@upstash/ratelimit'\nconst ratelimit = new Ratelimit({\n  redis: Redis.fromEnv(),\n  limiter: Ratelimit.slidingWindow(100, '1 m')\n})`,
        priority: 'short-term' as const,
      },
      {
        title: 'Implement Health Check Endpoint',
        description:
          'Add a /health endpoint that checks all critical dependencies before reporting healthy.',
        codeSnippet: `// GET /health\nexport async function GET() {\n  const checks = await Promise.allSettled([\n    checkDatabase(),\n    checkCache(),\n  ])\n  const healthy = checks.every(c => c.status === 'fulfilled')\n  return Response.json({ status: healthy ? 'ok' : 'degraded' }, \n    { status: healthy ? 200 : 503 }\n  )\n}`,
        priority: 'short-term' as const,
      },
    ],
    guardrailRecommendation:
      'Adopt the Bulkhead pattern: isolate critical service pools with separate thread pools and connection limits to prevent one failure from exhausting shared resources.',
  }
  return mockDiagnosis
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/gemma/diagnose
 *
 * Accepts an incident description and returns an AI-generated SRE diagnosis.
 *
 * Request body:
 * ```json
 * {
 *   "rootService": "payment-service",
 *   "blastRadius": ["order-service", "notification-service"],
 *   "topology": [{ "source": "order-service", "target": "payment-service" }]
 * }
 * ```
 *
 * Response: {@link DiagnosisResult} as JSON (200).
 * Falls back to a mock diagnosis when `GEMINI_API_KEY` is not set.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ------------------------------------------------------------------
  // 1. Parse & validate request body
  // ------------------------------------------------------------------
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('rootService' in body) ||
    !('blastRadius' in body) ||
    !('topology' in body)
  ) {
    return NextResponse.json(
      {
        error:
          'Request body must include "rootService" (string), "blastRadius" (string[]), and "topology" (TopologyEdge[]).',
      },
      { status: 400 },
    )
  }

  const { rootService, blastRadius, topology } = body as DiagnoseRequest

  if (typeof rootService !== 'string' || rootService.trim() === '') {
    return NextResponse.json(
      { error: '"rootService" must be a non-empty string.' },
      { status: 400 },
    )
  }

  if (!Array.isArray(blastRadius) || blastRadius.some((s) => typeof s !== 'string')) {
    return NextResponse.json(
      { error: '"blastRadius" must be an array of strings.' },
      { status: 400 },
    )
  }

  if (
    !Array.isArray(topology) ||
    topology.some(
      (e) =>
        typeof e !== 'object' ||
        e === null ||
        typeof (e as TopologyEdge).source !== 'string' ||
        typeof (e as TopologyEdge).target !== 'string',
    )
  ) {
    return NextResponse.json(
      {
        error:
          '"topology" must be an array of { source: string, target: string } objects.',
      },
      { status: 400 },
    )
  }

  // ------------------------------------------------------------------
  // 2. Graceful fallback when API key is absent
  // ------------------------------------------------------------------
  if (!process.env.GEMINI_API_KEY) {
    const mock = getMockDiagnosis(rootService, blastRadius)
    return NextResponse.json(mock)
  }

  // ------------------------------------------------------------------
  // 3. Call Gemma 4 via Google GenAI SDK
  // ------------------------------------------------------------------
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' })

    const response = await ai.models.generateContent({
      model: 'gemma-4',
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(rootService, blastRadius, topology) }],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    })

    const rawText = response.text ?? ''
    const diagnosis = extractJson(rawText) as DiagnosisResult

    return NextResponse.json(diagnosis)
  } catch (error) {
    console.error('[/api/gemma/diagnose] Gemma call failed:', error)

    // Fall back to mock so the UI never breaks
    const mock = getMockDiagnosis(rootService, blastRadius)
    return NextResponse.json(mock)
  }
}
