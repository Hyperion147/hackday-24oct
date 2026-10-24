# StackPulse

StackPulse is an interactive service-health dashboard for exploring a microservice architecture and simulating cascading failures. The dashboard starts with a sample e-commerce topology and runs its canvas, incident feed, and live telemetry simulation in the browser.

## Features

- Explore a dependency graph of services and inspect their health and latency.
- Trigger a failure from a service node or simulate random chaos to see dependent services degrade and an incident appear.
- Reset the sample system after a simulation.
- Review 90-day availability history and a rolling latency chart.
- Import a PNG or JPEG architecture diagram for AI-assisted topology parsing.
- Open an incident to view a root-cause analysis and remediation guidance.
- Switch between light and dark themes.

## Getting started

Requirements: Node.js 20.9 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Create a `.env.local` file in the project root for optional integrations:

```dotenv
# Optional: enables Gemma-powered diagram parsing and incident diagnosis.
GEMINI_API_KEY=

# Optional: required by Supabase-backed server features.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Alternatively, use NEXT_PUBLIC_SUPABASE_ANON_KEY.

# Optional: lets trusted server-side chaos operations bypass row-level security.
# Keep this key secret; never use a NEXT_PUBLIC_ prefix for it.
SUPABASE_SERVICE_ROLE_KEY=
```

The local dashboard and its built-in chaos simulation work without these variables. Without `GEMINI_API_KEY`, incident diagnosis uses a mock response; diagram parsing requires the key. Supabase-backed routes require a configured Supabase project with the `services`, `service_edges`, and `incidents` tables expected by the application. The browser dashboard's sample topology and simulation state are local and are not persisted to Supabase.

## Using the dashboard

- Use **Break Service** or **Recover** on a service node to simulate or resolve an outage.
- Use **Simulate Random Chaos** to fail a randomly selected service.
- Select an incident or **AI analysis** to open its diagnosis and remediation steps.
- Use **Reset System** to restore the sample topology's baseline state.
- Choose **Import Diagram** to upload a PNG or JPEG architecture diagram.
- In **System Telemetry**, switch between the 90-day uptime view and live latency.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/gemma/diagnose` | Returns an AI-generated incident diagnosis; uses a mock diagnosis if `GEMINI_API_KEY` is absent. |
| `POST` | `/api/gemma/parse-diagram` | Accepts multipart form data with an `image` file and returns parsed services and connections. Requires `GEMINI_API_KEY`. |
| `POST` | `/api/chaos` | Updates Supabase service health and incident records. Accepts `{ "serviceId": "...", "projectId": "...", "mode": "break" }` or mode `"recover"`. |

The chaos route expects the referenced project and service records to exist in Supabase. Its service-role key is optional; without it, requests use the cookie-scoped client and are subject to your Supabase row-level security policies.

## Development commands

```bash
pnpm dev        # Start the development server
pnpm build      # Create a production build
pnpm start      # Serve the production build
pnpm lint       # Run ESLint
pnpm typecheck  # Run the TypeScript compiler without emitting files
```

## Tech stack

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, React Flow, Zustand, Supabase, and Google's GenAI SDK.
