import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/** Browser-side Supabase client bound to the `public` schema. */
export type SupabaseBrowserClient = SupabaseClient<Database>

let browserClient: SupabaseBrowserClient | null = null

/**
 * Preferred (new) Supabase publishable key, falling back to the classic
 * anon key — both grant the same anonymous, RLS-scoped access.
 */
function resolveAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    undefined
  )
}

/**
 * Returns the process-wide browser client, or `null` when Supabase env vars
 * are not configured (callers decide how to degrade).
 *
 * `createBrowserClient` caches its own singleton per url/key pair internally,
 * but we memoise anyway to keep the `null` branch cheap and predictable.
 */
export function getSupabaseBrowserClient(): SupabaseBrowserClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = resolveAnonKey()
  if (!url || !key) return null
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, key)
  }
  return browserClient
}
