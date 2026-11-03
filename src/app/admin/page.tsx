"use client";

import { useEffect, useMemo, useState } from "react";
import { getDemoRecords, notifyDemoRecordsChanged, saveDemoRecords, type DemoRecord, type DemoStatus } from "@/lib/demo-data";

const STATUS_OPTIONS: Array<{ value: DemoStatus; label: string; color: string }> = [
  { value: "green", label: "GREEN", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "yellow", label: "YELLOW", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "red", label: "RED", color: "bg-red-100 text-red-700 border-red-200" },
];

export default function AdminPage() {
  const [records, setRecords] = useState<DemoRecord[]>([]);

  useEffect(() => {
    const refresh = () => setRecords(getDemoRecords());
    refresh();

    window.addEventListener("election-delegate-records-changed", refresh);
    return () => window.removeEventListener("election-delegate-records-changed", refresh);
  }, []);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [records],
  );

  const updateStatus = (recordId: string, nextStatus: DemoStatus) => {
    const nextRecords = records.map((record) => {
      if (record.id !== recordId) {
        return record;
      }

      return {
        ...record,
        verification_status: nextStatus,
        updated_at: new Date().toISOString(),
      };
    });

    setRecords(nextRecords);
    saveDemoRecords(nextRecords);
    notifyDemoRecordsChanged();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Representative colour labelling</h1>
        <p className="mt-2 text-sm text-slate-600">Select one colour for each representative. The live dashboard updates immediately after each save.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">All representatives</p>
            <p className="text-sm text-slate-500">{sortedRecords.length} names ready for status assignment</p>
          </div>
        </div>

        <div className="space-y-3">
          {sortedRecords.map((record) => (
            <div key={record.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.5fr_1fr_220px] md:items-center">
              <div>
                <p className="text-sm font-semibold text-slate-900">{record.full_name}</p>
                <p className="text-xs text-slate-500">{record.constituency_name}</p>
              </div>

              <div className="text-sm text-slate-600">{record.phone || "No phone available"}</div>

              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Colour</span>
                <select
                  value={record.verification_status}
                  onChange={(event) => updateStatus(record.id, event.target.value as DemoStatus)}
                  className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
