import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv, isSupabaseAuthEnabled } from "@/lib/env";

// Pages that need a signed-in account. Anyone not signed in is sent to /login first.
const PROTECTED_PATHS = ["/dashboard", "/records", "/admin"];

export async function updateSession(request: NextRequest) {
  const env = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  if (!env || !isSupabaseAuthEnabled()) {
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as any);
        });
      },
    },
  });

  // Refreshes the sign-in session cookie when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
