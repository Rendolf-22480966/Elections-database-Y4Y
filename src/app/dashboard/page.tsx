"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { getDashboardSummary, getDemoRecords, type DemoRecord } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type DashboardRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
  gender: string | null;
  verification_status: "green" | "yellow" | "red";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  // Supabase returns an object for this kind of link; older code expected a list.
  constituencies: { name: string } | { name: string }[] | null;
};

type LiveState = "connecting" | "live" | "offline" | "demo";

const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request

function getConstituencyName(value: DashboardRow["constituencies"]): string {
  if (!value) return "Unassigned";
  if (Array.isArray(value)) return value[0]?.name ?? "Unassigned";
  return value.name ?? "Unassigned";
}

export default function DashboardPage() {
  const [records, setRecords] = useState<DemoRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState>(isSupabaseConfigured() ? "connecting" : "demo");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setRecords(getDemoRecords());
      setLastUpdated(new Date());
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const allRows: DashboardRow[] = [];

    // Load every record, page by page (the old code stopped at 50).
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("administrative_records")
        .select(
          "id, full_name, phone_e164, gender, verification_status, admin_note, created_at, updated_at, constituencies(name)",
        )
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        // Show the problem instead of quietly switching to fake demo data.
        setLoadError("Could not load the latest data. Check your connection and that you are signed in.");
        return;
      }

      const rows = (data ?? []) as unknown as DashboardRow[];
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }

    setRecords(
      allRows.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        constituency_id: "supabase",
        constituency_name: getConstituencyName(row.constituencies),
        phone: row.phone_e164 ?? "",
        gender: (row.gender as DemoRecord["gender"]) ?? "",
        verification_status: row.verification_status,
        admin_note: row.admin_note ?? "",
        created_by: "supabase",
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
    setLoadError(null);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    let isMounted = true;

    // When many changes arrive at once (e.g. a bulk upload), reload once instead of 100 times.
    const scheduleReload = () => {
      if (!isMounted) return;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        if (isMounted) void loadData();
      }, 300);
    };

    void loadData();
    window.addEventListener("storage", scheduleReload);
    window.addEventListener("election-delegate-records-changed", scheduleReload);

    let cleanupRealtime = () => {};

    if (isSupabaseConfigured()) {
      const supabase = createBrowserSupabaseClient();
      const channel = supabase
        .channel("dashboard-records-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "administrative_records" }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "constituencies" }, scheduleReload)
        .subscribe((status) => {
          if (!isMounted) return;
          if (status === "SUBSCRIBED") {
            setLiveState("live");
            // Catch anything that changed while we were connecting or offline.
            scheduleReload();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setLiveState("offline");
          }
        });

      cleanupRealtime = () => {
        void supabase.removeChannel(channel);
      };
    }

    // If the laptop/phone was asleep, refresh when the person comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted = false;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      window.removeEventListener("storage", scheduleReload);
      window.removeEventListener("election-delegate-records-changed", scheduleReload);
      document.removeEventListener("visibilitychange", onVisible);
      cleanupRealtime();
    };
  }, [loadData]);

  const summary = useMemo(() => getDashboardSummary(records), [records]);
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, DemoRecord[]>();

    for (const record of records) {
      const groupName = record.constituency_name || "Unassigned";
      const current = groups.get(groupName) ?? [];
      current.push(record);
      groups.set(groupName, current);
    }

    return Array.from(groups.entries())
      .map(([constituency, items]) => ({
        constituency,
        records: [...items].sort((a, b) => {
          const order = ["Youth Organizer", "Deputy Youth Organizer", "Deputy Youth", "Other Youth Rep", "Youth organizer", "Deputy youth"];
          const aIndex = order.indexOf(a.admin_note.trim());
          const bIndex = order.indexOf(b.admin_note.trim());
          const aRank = aIndex === -1 ? 99 : aIndex;
          const bRank = bIndex === -1 ? 99 : bIndex;
          if (aRank !== bRank) return aRank - bRank;
          return a.full_name.localeCompare(b.full_name);
        }),
      }))
      .sort((a, b) => a.constituency.localeCompare(b.constituency));
  }, [records]);

  const chartData = useMemo(
    () =>
      Array.from(
        records.reduce((accumulator, record) => {
          const key = (record.constituency_name || "Unassigned").trim();
          if (!key) {
            return accumulator;
          }

          accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
          return accumulator;
        }, new Map<string, number>()).entries(),
      )
        .map(([name, count]) => ({
          name,
          shortName: getConstituencyShortName(name),
          count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [records],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Overview</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Delegate performance</h2>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge state={liveState} lastUpdated={lastUpdated} />
          <Button variant="secondary" onClick={() => void loadData()}>
            Refresh data
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total delegates" value={summary.total.toString()} accent="blue" />
        <StatCard label="GREEN" value={summary.green.toString()} accent="green" />
        <StatCard label="YELLOW" value={summary.yellow.toString()} accent="amber" />
        <StatCard label="RED" value={summary.red.toString()} accent="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_0.95fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Delegates by constituency</p>
              <p className="text-xs text-slate-500">Live count across active districts</p>
            </div>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="shortName"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={60}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#475569" }} />
                <Tooltip
                  formatter={(value: number | string, name, item) => [value, item?.payload?.name ?? name]}
                  labelFormatter={(label) => {
                    const match = chartData.find((entry) => entry.shortName === label);
                    return match ? match.name : String(label);
                  }}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Status heat map</p>
          <div className="mt-4 space-y-4">
            {summary.byStatus.map((item) => {
              const total = Math.max(summary.total, 1);
              const share = Math.round((item.count / total) * 100);
              const colorMap = {
                green: "bg-emerald-500",
                yellow: "bg-amber-500",
                red: "bg-red-500",
              } as const;

              return (
                <div key={item.status}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold uppercase tracking-[0.12em] text-slate-700">{item.status}</span>
                    <span className="font-semibold text-slate-800">{item.count}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${colorMap[item.status]}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Executive contact directory</p>
            <p className="text-xs text-slate-500">Complete constituency roster with positions and phone numbers</p>
          </div>
        </div>

        <div className="space-y-6">
          {groupedRecords.map(({ constituency, records: constituencyRecords }, groupIndex) => (
            <div key={`${constituency}-${groupIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <h3 className="text-xl font-bold text-slate-900">{groupIndex + 1}. {constituency}</h3>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">{constituencyRecords.length} members</span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {constituencyRecords.map((record) => {
                  const statusTone = getStatusTone(record.verification_status);

                  return (
                    <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-4 transition-colors duration-500">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors duration-500 ${statusTone.badge}`}>
                          {record.verification_status.toUpperCase()}
                        </span>
                      </div>

                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Position</p>
                      <h4 className="text-base font-semibold text-slate-900">{record.admin_note || "—"}</h4>

                      <div className="mt-5 space-y-3 border-t border-slate-100 pt-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Name</p>
                          <p className="mt-1 text-sm font-medium text-slate-800">{record.full_name}</p>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Phone number</p>
                          <p className="mt-1 text-sm font-medium text-slate-800">{record.phone || "Missing"}</p>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                          <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium transition-colors duration-500 ${statusTone.text}`}>
                            {record.verification_status.toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LiveBadge({ state, lastUpdated }: { state: LiveState; lastUpdated: Date | null }) {
  const config = {
    live: { dot: "bg-emerald-500 animate-pulse", label: "Live", tone: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
    connecting: { dot: "bg-amber-400", label: "Connecting…", tone: "text-amber-700 bg-amber-50 ring-amber-200" },
    offline: { dot: "bg-red-500", label: "Offline – tap Refresh", tone: "text-red-700 bg-red-50 ring-red-200" },
    demo: { dot: "bg-slate-400", label: "Demo data", tone: "text-slate-600 bg-slate-50 ring-slate-200" },
  }[state];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${config.tone}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
      {lastUpdated ? (
        <span className="font-normal opacity-70">
          · updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      ) : null}
    </div>
  );
}

function getConstituencyShortName(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return "N/A";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }

  return parts
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getStatusTone(status: DemoRecord["verification_status"]) {
  switch (status) {
    case "green":
      return {
        badge: "bg-emerald-100 text-emerald-700",
        text: "bg-emerald-50 text-emerald-700",
      };
    case "yellow":
      return {
        badge: "bg-amber-100 text-amber-700",
        text: "bg-amber-50 text-amber-700",
      };
    case "red":
      return {
        badge: "bg-red-100 text-red-700",
        text: "bg-red-50 text-red-700",
      };
    default:
      return {
        badge: "bg-slate-100 text-slate-700",
        text: "bg-slate-50 text-slate-700",
      };
  }
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: "blue" | "green" | "amber" | "red" }) {
  const colorClass = {
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  }[accent];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${colorClass}`}>{label}</div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
