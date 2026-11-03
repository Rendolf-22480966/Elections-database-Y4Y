"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Campaign manager's colour panel.
// Picking GREEN / YELLOW / RED saves straight to Supabase, and every open
// dashboard (on any phone or computer) updates within about a second.

type Status = "green" | "yellow" | "red";
type AppRole = "administrator" | "campaign_manager" | "executive_viewer";
type LiveState = "connecting" | "live" | "offline";

type Rep = {
  id: string;
  full_name: string;
  constituency_name: string;
  admin_note: string;
  phone: string;
  verification_status: Status;
  updated_at: string;
};

type DbRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
  admin_note: string | null;
  verification_status: Status;
  updated_at: string;
  constituencies: { name: string } | { name: string }[] | null;
};

const STATUS_OPTIONS: Array<{ value: Status; label: string; tone: string; dot: string }> = [
  { value: "green", label: "GREEN", tone: "border-emerald-300 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  { value: "yellow", label: "YELLOW", tone: "border-amber-300 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  { value: "red", label: "RED", tone: "border-red-300 bg-red-50 text-red-800", dot: "bg-red-500" },
];

const POSITION_ORDER = ["youth organizer", "deputy youth organizer", "deputy youth", "other youth rep"];

function constituencyNameOf(value: DbRow["constituencies"]) {
  if (!value) return "Unassigned";
  if (Array.isArray(value)) return value[0]?.name ?? "Unassigned";
  return value.name ?? "Unassigned";
}

function positionRank(note: string) {
  const index = POSITION_ORDER.indexOf(note.trim().toLowerCase().replace(/\s+/g, " "));
  return index === -1 ? 99 : index;
}

export default function AdminPage() {
  const configured = isSupabaseConfigured();
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("connecting");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const canEdit = role === "administrator" || role === "campaign_manager";

  const loadReps = useCallback(async () => {
    if (!configured) return;
    const supabase = createBrowserSupabaseClient();
    const rows: DbRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("administrative_records")
        .select("id, full_name, phone_e164, admin_note, verification_status, updated_at, constituencies(name)")
        .order("full_name")
        .range(from, from + 999);
      if (error) {
        setMessage({ kind: "error", text: `Could not load representatives: ${error.message}` });
        return;
      }
      const page = (data ?? []) as unknown as DbRow[];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    setReps(
      rows.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        constituency_name: constituencyNameOf(row.constituencies),
        admin_note: row.admin_note ?? "",
        phone: row.phone_e164 ?? "",
        verification_status: row.verification_status,
        updated_at: row.updated_at,
      })),
    );
    setLoaded(true);
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    let isMounted = true;
    const supabase = createBrowserSupabaseClient();

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !isMounted) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      if (isMounted) setRole((profile?.role as AppRole | undefined) ?? "executive_viewer");
    });

    const scheduleReload = () => {
      if (!isMounted) return;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        if (isMounted) void loadReps();
      }, 300);
    };

    void loadReps();

    // If someone else (e.g. a second manager) changes a colour, this page updates too.
    const channel = supabase
      .channel("admin-colour-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "administrative_records" }, scheduleReload)
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === "SUBSCRIBED") setLiveState("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveState("offline");
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted = false;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [configured, loadReps]);

  const updateStatus = async (rep: Rep, nextStatus: Status) => {
    if (!canEdit || rep.verification_status === nextStatus) return;

    // Show it straight away; undo if the save fails.
    setReps((current) => current.map((r) => (r.id === rep.id ? { ...r, verification_status: nextStatus } : r)));
    setSavingId(rep.id);
    setMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const undo = (text: string) => {
      setReps((current) => current.map((r) => (r.id === rep.id ? rep : r)));
      setSavingId(null);
      setMessage({ kind: "error", text });
    };

    if (!userId) return undo("Your sign-in has expired. Please sign in again.");

    const { data, error } = await supabase
      .from("administrative_records")
      .update({ verification_status: nextStatus, updated_by: userId })
      .eq("id", rep.id)
      .select("updated_at")
      .single();

    if (error) {
      return undo(
        /row-level security|permission denied|0 rows|JSON object requested/i.test(error.message)
          ? "Your account is not allowed to change colours. Ask the administrator to give you the campaign manager role."
          : error.message,
      );
    }

    setSavingId(null);
    setReps((current) => current.map((r) => (r.id === rep.id ? { ...r, updated_at: data?.updated_at ?? r.updated_at } : r)));
    setMessage({ kind: "ok", text: `${rep.full_name} is now ${nextStatus.toUpperCase()}. Every dashboard has been updated.` });

    // Audit trail (the colour is already saved even if these fail).
    void supabase.from("verification_history").insert({
      record_id: rep.id,
      from_status: rep.verification_status,
      to_status: nextStatus,
      reason: "Colour changed from the admin colour panel",
      changed_by: userId,
    });
    void supabase.rpc("write_audit_event", {
      p_action: "verification.change",
      p_entity_type: "administrative_record",
      p_entity_id: rep.id,
      p_metadata: { from: rep.verification_status, to: nextStatus },
    });
  };

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = reps.filter(
      (rep) =>
        !query ||
        [rep.full_name, rep.constituency_name, rep.admin_note, rep.phone].join(" ").toLowerCase().includes(query),
    );
    const map = new Map<string, Rep[]>();
    for (const rep of filtered) {
      const list = map.get(rep.constituency_name) ?? [];
      list.push(rep);
      map.set(rep.constituency_name, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([constituency, list]) => ({
        constituency,
        reps: list.sort((a, b) => positionRank(a.admin_note) - positionRank(b.admin_note) || a.full_name.localeCompare(b.full_name)),
      }));
  }, [reps, search]);

  const counts = useMemo(
    () => ({
      green: reps.filter((r) => r.verification_status === "green").length,
      yellow: reps.filter((r) => r.verification_status === "yellow").length,
      red: reps.filter((r) => r.verification_status === "red").length,
    }),
    [reps],
  );

  if (!configured) {
    return <Panel>The database is not connected. Check the Supabase settings in .env.local.</Panel>;
  }

  if (role && !canEdit) {
    return (
      <Panel>
        Only the campaign manager and administrators can change colours.{" "}
        <a href="/dashboard" className="font-semibold text-blue-700 underline">
          Go to the live dashboard
        </a>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Admin</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Representative colour labelling</h1>
            <p className="mt-2 text-sm text-slate-600">
              Pick a colour for a representative. It is saved instantly and shows on every dashboard.
            </p>
          </div>
          <LiveBadge state={liveState} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {STATUS_OPTIONS.map((option) => (
            <div key={option.value} className={`rounded-xl border px-4 py-3 ${option.tone}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">{option.label}</p>
              <p className="text-2xl font-bold">{counts[option.value]}</p>
            </div>
          ))}
        </div>
      </div>

      {message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">All representatives</p>
            <p className="text-sm text-slate-500">
              {loaded ? `${reps.length} representatives in ${groups.length} constituencies` : "Loading…"}
            </p>
          </div>
          <div className="md:w-80">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, constituency, phone…" />
          </div>
        </div>

        {loaded && reps.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            No representatives in the database yet. Run 0003_load_delegates.sql in Supabase.
          </p>
        ) : null}

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.constituency}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-slate-700">{group.constituency}</h2>
              <div className="space-y-2">
                {group.reps.map((rep) => {
                  const option = STATUS_OPTIONS.find((o) => o.value === rep.verification_status) ?? STATUS_OPTIONS[1];
                  return (
                    <div
                      key={rep.id}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.5fr_1fr_1fr_220px] md:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${option.dot}`} />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{rep.full_name}</p>
                          <p className="text-xs text-slate-500">{rep.admin_note || "—"}</p>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">{rep.constituency_name}</div>
                      <div className="text-sm text-slate-600">{rep.phone || "No phone available"}</div>
                      <label className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Colour</span>
                        <select
                          value={rep.verification_status}
                          disabled={!canEdit || savingId === rep.id}
                          onChange={(event) => void updateStatus(rep, event.target.value as Status)}
                          className={`h-10 flex-1 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:opacity-60 ${option.tone}`}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
      {children}
    </div>
  );
}

function LiveBadge({ state }: { state: LiveState }) {
  const config = {
    live: { dot: "bg-emerald-500 animate-pulse", label: "Live", tone: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
    connecting: { dot: "bg-amber-400", label: "Connecting…", tone: "text-amber-700 bg-amber-50 ring-amber-200" },
    offline: { dot: "bg-red-500", label: "Offline – reload the page", tone: "text-red-700 bg-red-50 ring-red-200" },
  }[state];
  return (
    <span className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${config.tone}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
