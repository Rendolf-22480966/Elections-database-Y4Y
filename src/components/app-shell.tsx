"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Frame around every page. Every page except sign-in needs a real Supabase account.
// - Campaign managers / administrators: Colour panel, Dashboard, Delegates
// - Everyone else with an account: Dashboard (view only)

type AppRole = "administrator" | "campaign_manager" | "executive_viewer";
type Viewer = { name: string; role: AppRole };

const PUBLIC_PATHS = ["/login", "/signup", "/admin-login"];

const ROLE_LABEL: Record<AppRole, string> = {
  administrator: "Administrator",
  campaign_manager: "Campaign Manager",
  executive_viewer: "Viewer",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const isPublicPage = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!configured) {
      setChecked(true);
      return;
    }

    let isMounted = true;
    const supabase = createBrowserSupabaseClient();

    const loadViewer = async () => {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (!data.user) {
        setViewer(null);
        setChecked(true);
        if (!isPublicPage) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", data.user.id).single();
      if (!isMounted) return;
      setViewer({
        name: profile?.full_name ?? data.user.email ?? "Signed in",
        role: (profile?.role as AppRole | undefined) ?? "executive_viewer",
      });
      setChecked(true);
    };

    void loadViewer();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setViewer(null);
        router.replace("/login");
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void loadViewer();
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [configured, isPublicPage, pathname, router]);

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    setViewer(null);
    router.replace("/login");
    router.refresh();
  };

  // Sign-in page: no menu bar (it has its own full-page design).
  if (isPublicPage) return <>{children}</>;

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-slate-600">
        The database is not connected. Check the Supabase settings in .env.local.
      </div>
    );
  }

  if (!checked || !viewer) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  const isStaff = viewer.role === "administrator" || viewer.role === "campaign_manager";
  const navItems = [
    ...(isStaff ? [{ href: "/admin", label: "Colour panel" }] : []),
    { href: "/dashboard", label: "Dashboard" },
    ...(isStaff ? [{ href: "/records", label: "Delegates" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">Election Data Platform</p>
            <h1 className="text-lg font-semibold text-slate-900">Operations Dashboard</h1>
          </div>

          <nav className="flex items-center gap-2">
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
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-slate-800">{viewer.name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[viewer.role]}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
