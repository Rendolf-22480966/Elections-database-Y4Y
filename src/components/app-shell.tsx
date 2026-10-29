"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearDemoSession, getDemoSession, type DemoSession } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const publicPaths = ["/login", "/signup"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const configured = isSupabaseConfigured();

      if (configured) {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();

        if (authSession?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, full_name")
            .eq("id", authSession.user.id)
            .maybeSingle();

          setSession({
            id: authSession.user.id,
            name: profile?.full_name ?? authSession.user.user_metadata?.full_name ?? authSession.user.email ?? "Admin",
            email: authSession.user.email ?? "",
            role: (profile?.role as DemoSession["role"]) ?? "administrator",
          });
          return;
        }

        setSession(null);
        return;
      }

      setSession(getDemoSession());
    };

    void loadSession();

    const handleStorage = () => setSession(getDemoSession());
    window.addEventListener("storage", handleStorage);

    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!session && !publicPaths.includes(pathname)) {
      router.replace("/login");
    }
    if (session && publicPaths.includes(pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, router, session]);

  const navItems = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/records", label: "Delegates" },
    ],
    [],
  );

  const isPublicPage = publicPaths.includes(pathname);

  const handleLogout = async () => {
    const configured = isSupabaseConfigured();

    if (configured) {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    }

    clearDemoSession();
    setSession(null);
    router.push("/login");
  };

  if (isPublicPage && !session) {
    return <div className="min-h-screen bg-slate-100">{children}</div>;
  }

  if (!session && !isPublicPage) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">Election Data Platform</p>
            <h1 className="text-lg font-semibold text-slate-900">Operations Dashboard</h1>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  pathname === item.href ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 md:block">
              {session?.name}
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
