"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDemoUserByEmail, saveDemoSession, type DemoUser } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "campaign_manager" as "administrator" | "campaign_manager" | "executive_viewer",
  });
  const [error, setError] = useState("");

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      setError("Please complete every field and use at least 8 characters for the password.");
      return;
    }

    const configured = isSupabaseConfigured();

    if (configured) {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.name.trim(),
          },
        },
      });

      if (signUpError || !data.user) {
        setError(signUpError?.message ?? "Unable to create this account.");
        return;
      }

      router.push("/dashboard");
      return;
    }

    if (getDemoUserByEmail(form.email)) {
      setError("That email already exists in the demo workspace.");
      return;
    }

    const user: DemoUser = {
      id: `demo-user-${Date.now()}`,
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
    };

    const existing = typeof window !== "undefined" ? window.localStorage.getItem("election-demo-users") : null;
    const users: DemoUser[] = existing ? (JSON.parse(existing) as DemoUser[]) : [];
    users.push(user);
    window.localStorage.setItem("election-demo-users", JSON.stringify(users));

    saveDemoSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fef3c7,_#f8fafc_44%,_#e2e8f0)] px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Create account</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Set up a new admin workspace</h1>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={form.name} onChange={(event) => handleChange("name", event.target.value)} placeholder="Jane Doe" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(event) => handleChange("email", event.target.value)} placeholder="you@example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={form.password} onChange={(event) => handleChange("password", event.target.value)} placeholder="Minimum 8 characters" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={form.role}
              onChange={(event) => handleChange("role", event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
            >
              <option value="campaign_manager">Campaign manager</option>
              <option value="administrator">Administrator</option>
              <option value="executive_viewer">Executive viewer</option>
            </select>
          </div>

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account? {" "}
          <Link href="/login" className="font-semibold text-blue-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
