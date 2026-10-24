import { cookies } from "next/headers"

import type { ServerCookieAdapter } from "@/lib/supabase/server"

/**
 * Bridge between the Next.js request context (`next/headers`) and the Supabase
 * server client's cookie adapter. Keeping the Next-specific import here means
 * data-access modules (`lib/supabase/server.ts`, `lib/chaos/*`) stay free of
 * request-context dependencies and remain trivially unit-testable.
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
