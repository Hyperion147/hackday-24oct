import { cookies } from "next/headers"

import type { ServerCookieAdapter } from "@/lib/supabase/server"

/**
 * Bridge between the Next.js request context and the Supabase server client.
 *
 * This module exists because of a module-graph restriction: `next/headers`
 * (and anything under `next/dist/server/**` reachable from it) must stay out
 * of the files that construct and use Supabase clients — importing both in
 * the same module breaks the Supabase builders' generic inference. Route
 * handlers import this file and pass the adapter into `createClient`.
 */
export async function getServerCookieAdapter(): Promise<ServerCookieAdapter> {
  const cookieStore = await cookies()

  return {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      } catch {
        // Called from a Server Component: session refresh will be handled by
        // middleware, which is the only place that can mutate cookies.
      }
    },
  }
}
