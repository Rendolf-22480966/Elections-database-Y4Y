"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDemoUserByEmail, saveDemoSession } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("rendolfagyemang2@gmail.com");
  const [password, setPassword] = useState("Rendolf488$");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const configured = isSupabaseConfigured();

    if (configured) {
      const supabase = createBrowserSupabaseClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data.user) {
        setError(authError?.message ?? "Unable to sign in with Supabase.");
        return;
      }

      router.push("/dashboard");
      return;
    }

    const user = getDemoUserByEmail(email);

    if (!user || user.password !== password) {
      setError("Incorrect email or password.");
      return;
    }

    saveDemoSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    router.push("/dashboard");
  };

  return (
    <div className="relative min-h-[180vh] overflow-y-auto bg-[radial-gradient(circle_at_top,_#f8f6f3,_#f3f5f3_32%,_#eef1ef)] px-4 py-8 sm:px-6 lg:px-8">
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

      <div className="relative z-10 flex min-h-[160vh] items-center justify-start pt-10 pb-20">
        <div className="ml-0 mr-auto w-full max-w-md sm:ml-4 lg:ml-12">
          <div className="rounded-[28px] border border-[#eae0d0] bg-white/85 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-7">
            <div className="mb-6 text-center sm:text-left">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e8d7aa] bg-[#faf5ea] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a77a2c]">
                Election Data Platform
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-900">Secure access</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use your official credentials to manage delegates and monitor election progress.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="rendolfagyemang2@gmail.com"
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-slate-200 bg-white text-slate-800 shadow-sm transition focus:border-[#b9935a] focus:ring-2 focus:ring-[#d8c29a]/60"
                />
              </div>

              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

              <Button
                type="submit"
                className="h-11 w-full rounded-xl bg-blue-700 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)] transition hover:bg-blue-800"
              >
                Sign in
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              Don’t have an account? {" "}
              <Link href="/signup" className="font-semibold text-[#a77a2c] transition hover:text-[#8d6325]">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
