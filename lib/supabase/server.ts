import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/**
 * Server-side Supabase client utilties.
 *
 * IMPORTANT: this module deliberately does NOT import `next/headers`.
 * Importing the Next request-context module graph alongside the Supabase
 * clients breaks their conditional generic inference (table builders resolve
 * to `never`). The cookie adapter is therefore injected from a separate
 * module (`request.ts`), keeping Supabase call sites in a clean module graph.
 *
 * All Supabase reads/writes belong in files that never import from `next/**`.
 */

/** Server-side Supabase client bound to the `public` schema. */
export type SupabaseServerClient = SupabaseClient<Database>

/** Raised when required Supabase environment variables are missing. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SupabaseConfigError"
  }
}

function resolveAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) is not set",
    )
  }
  return key
}

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL is not set")
  }
  return url
}

/** True when the server env vars required by Supabase are present. */
export function isSupabaseServerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && resolveSafeAnonKey())
}

function resolveSafeAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    undefined
  )
}

/** Cookie-access adapter shape expected by `@supabase/ssr` server clients. */
export interface ServerCookieAdapter {
  getAll(): { name: string; value: string }[]
  setAll(cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void
}

/**
 * Creates a request-scoped, cookie-backed server client. Fresh client per
 * request — never shared across requests. This overload is used by server
 * code outside the Next module graph (`request.ts` injects the adapter).
 */
export async function createClient(cookies: ServerCookieAdapter): Promise<SupabaseServerClient> {
  return createServerClient<Database>(requireSupabaseUrl(), resolveAnonKey(), { cookies })
}

/**
 * Privileged client for trusted server-side operations (chaos injection).
 *
 * Uses `SUPABASE_SERVICE_ROLE_KEY` when available so mutations are not
 * subject to row-level security. Falls back to the cookie-scoped anon client
 * (RLS policies then apply) when no service role key is configured.
 */
export async function createAdminServiceClient(
  cookies: ServerCookieAdapter,
): Promise<SupabaseServerClient> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return createClient(cookies)
  }

  // The admin client is not cookie-backed: an all-empty cookie adapter
  // satisfies the ssr package's required options without touching sessions.
  return createServerClient<Database>(requireSupabaseUrl(), serviceRoleKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // No-op: the service-role client never persists sessions.
      },
    },
  })
}
