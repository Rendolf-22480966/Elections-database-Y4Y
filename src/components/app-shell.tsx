"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearDemoSession, getDemoSession, isAdminOnlyEmail, type DemoSession } from "@/lib/demo-data";

const publicPaths = ["/login", "/signup", "/admin-login"];
const protectedPaths = ["/dashboard", "/records", "/admin"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);

  useEffect(() => {
    setSession(getDemoSession());
    const handleStorage = () => setSession(getDemoSession());
    window.addEventListener("storage", handleStorage);
    window.addEventListener("election-demo-session-changed", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("election-demo-session-changed", handleStorage);
    };
  }, []);

  useEffect(() => {
    const isPublicPage = publicPaths.includes(pathname) || pathname === "/";
    const isProtectedPage = protectedPaths.includes(pathname);
    const isAdminSession = !!session && isAdminOnlyEmail(session.email);

    if (!session && isProtectedPage) {
      router.replace("/login");
      return;
    }

    if (session && (pathname === "/login" || pathname === "/signup" || pathname === "/admin-login" || pathname === "/")) {
      router.replace(isAdminSession ? "/admin" : "/dashboard");
      return;
    }

    if (isAdminSession && pathname === "/dashboard") {
      router.replace("/admin");
      return;
    }

    if (isAdminSession && pathname === "/records") {
      router.replace("/admin");
      return;
    }

    if (!isAdminSession && pathname === "/admin") {
      router.replace("/dashboard");
      return;
    }

    if (!session && !isPublicPage) {
      router.replace("/login");
    }
  }, [pathname, router, session]);

  const navItems = useMemo(
    () => [{ href: isAdminOnlyEmail(session?.email ?? "") ? "/admin" : "/records", label: isAdminOnlyEmail(session?.email ?? "") ? "Admin" : "Delegates" }],
    [session?.email],
  );

  const isPublicPage = publicPaths.includes(pathname) || pathname === "/";

  const handleLogout = async () => {
    clearDemoSession();
    setSession(null);
    router.push("/login");
  };

  if (isPublicPage && !session) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">Election Data Platform</p>
              <h1 className="text-lg font-semibold text-slate-900">Public dashboard</h1>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/admin-login" className="rounded-full bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800">
                Admin login
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    );
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
