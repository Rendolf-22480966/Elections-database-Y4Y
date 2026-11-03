"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Real sign-in with Supabase accounts (created by the administrator in Supabase).
// Campaign managers and administrators go to the colour panel; everyone else to the live dashboard.

async function destinationFor(userId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const role = data?.role as string | undefined;
  return role === "administrator" || role === "campaign_manager" ? "/admin" : "/dashboard";
}

function requestedPage() {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in on this device? Skip the form.
  useEffect(() => {
    if (!configured) return;
    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) router.replace(requestedPage() ?? (await destinationFor(data.user.id)));
    });
  }, [configured, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError || !data.user) {
        setError(
          signInError && /invalid login credentials/i.test(signInError.message)
            ? "Incorrect email or password."
            : (signInError?.message ?? "Unable to sign in."),
        );
        return;
      }

      router.replace(requestedPage() ?? (await destinationFor(data.user.id)));
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your internet connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#f8f6f3,_#f3f5f3_32%,_#eef1ef)] px-4 py-8 sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.9]"
        style={{
          backgroundImage: "url('/Boss.jpeg')",
          backgroundPosition: "right center",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          filter: "grayscale(0.04) contrast(1.12) brightness(0.96)",
        }}
      />

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.9)_28%,rgba(255,255,255,0.76)_46%,rgba(255,255,255,0.18)_100%)]" />

      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-start py-10">
        <div className="ml-0 mr-auto w-full max-w-md sm:ml-4 lg:ml-12">
          <div className="rounded-[28px] border border-[#eae0d0] bg-white/85 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-7">
            <div className="mb-6 text-center sm:text-left">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e8d7aa] bg-[#faf5ea] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a77a2c]">
                Election Data Platform
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900">Secure access</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sign in with your official credentials to see the live delegate dashboard.
              </p>
            </div>

            {!configured ? (
              <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                The database is not connected. Check the Supabase settings in .env.local.
              </p>
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border-slate-200 bg-white text-slate-800 shadow-sm transition focus:border-[#b9935a] focus:ring-2 focus:ring-[#d8c29a]/60"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-slate-200 bg-white text-slate-800 shadow-sm transition focus:border-[#b9935a] focus:ring-2 focus:ring-[#d8c29a]/60"
                />
              </div>

              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

              <Button
                type="submit"
                disabled={isSubmitting || !configured}
                className="h-11 w-full rounded-xl bg-blue-700 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)] transition hover:bg-blue-800"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              No account, or forgot your password? Ask the campaign administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
