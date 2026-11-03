import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv, isSupabaseAuthEnabled } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback", "/api/records/import", "/dashboard", "/"];

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

  const hasSessionCookie = request.cookies.getAll().some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.includes("auth-token") || name.includes("refresh-token") || name.includes("supabase") || name.startsWith("sb-");
  });

  const user = hasSessionCookie ? (await supabase.auth.getUser()).data.user : null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  const isProtectedRoute = pathname === "/records";

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!user && !isPublic && pathname !== "/records") {
    return response;
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/records";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
