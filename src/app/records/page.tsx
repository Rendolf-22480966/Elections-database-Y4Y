"use client";

import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isSupabaseConfigured } from "@/lib/env";
import { normalizeGhanaPhone } from "@/lib/phone";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Campaign manager panel.
// Everything here reads from and writes to Supabase directly, so every change
// (especially GREEN / YELLOW / RED) reaches all open dashboards instantly.
// Nothing is kept only in this browser any more.
// ---------------------------------------------------------------------------

type Status = "green" | "yellow" | "red";
type Gender = "" | "female" | "male" | "other" | "prefer_not_to_say";
type AppRole = "administrator" | "campaign_manager" | "executive_viewer";
type SortKey = "full_name" | "constituency_name" | "admin_note" | "phone" | "verification_status" | "updated_at";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | Status;
type LiveState = "connecting" | "live" | "offline";

type Constituency = { id: string; name: string };

type Row = {
  id: string;
  full_name: string;
  constituency_id: string;
  constituency_name: string;
  phone: string; // as typed / shown, e.g. +233241234567
  gender: Gender;
  verification_status: Status;
  admin_note: string;
  updated_at: string;
};

type DbRow = {
  id: string;
  full_name: string;
  constituency_id: string;
  phone_e164: string | null;
  gender: Gender | null;
  verification_status: Status;
  admin_note: string | null;
  updated_at: string;
  constituencies: { name: string } | { name: string }[] | null;
};

type FormValues = {
  full_name: string;
  constituency_id: string;
  phone: string;
  gender: Gender;
  verification_status: Status;
  admin_note: string;
};

const PAGE_SIZE = 10;
const FETCH_SIZE = 1000;
const STATUSES: Status[] = ["green", "yellow", "red"];
const SELECT_COLUMNS =
  "id, full_name, constituency_id, phone_e164, gender, verification_status, admin_note, updated_at, constituencies(name)";

const EMPTY_FORM: FormValues = {
  full_name: "",
  constituency_id: "",
  phone: "",
  gender: "",
  verification_status: "yellow",
  admin_note: "",
};

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:opacity-60";

const STATUS_SELECT_TONE: Record<Status, string> = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-800",
  yellow: "border-amber-300 bg-amber-50 text-amber-800",
  red: "border-red-300 bg-red-50 text-red-800",
};

// Spellings used in the campaign's spreadsheets -> names in the database.
const CONSTITUENCY_ALIASES: Record<string, string> = {
  asougyaman: "asuogyaman",
  nsawam: "nsawamadoagyiri",
  akuapemnorth: "akropong",
  ofoaseayerebi: "ofoaseayirebi",
  asenemansoakroso: "aseneakrosomanso",
};

function nameKey(value: string) {
  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  return CONSTITUENCY_ALIASES[key] ?? key;
}

function normalizeStatus(value: unknown): Status {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "green" || v === "verified") return "green";
  if (v === "red" || v.includes("correction")) return "red";
  return "yellow";
}

function toPhone(value: string) {
  return normalizeGhanaPhone(value.trim()) ?? null;
}

function constituencyNameOf(value: DbRow["constituencies"]) {
  if (!value) return "Unassigned";
  if (Array.isArray(value)) return value[0]?.name ?? "Unassigned";
  return value.name ?? "Unassigned";
}

function fromDb(row: DbRow): Row {
  return {
    id: row.id,
    full_name: row.full_name,
    constituency_id: row.constituency_id,
    constituency_name: constituencyNameOf(row.constituencies),
    phone: row.phone_e164 ?? "",
    gender: row.gender ?? "",
    verification_status: normalizeStatus(row.verification_status),
    admin_note: row.admin_note ?? "",
    updated_at: row.updated_at,
  };
}

function friendlyError(message: string) {
  if (/administrative_records_phone_unique|duplicate key/i.test(message)) {
    return "Another delegate already has this phone number.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Your account is not allowed to make this change. Ask an administrator to give you the campaign manager role.";
  }
  if (/phone_e164_check|check constraint/i.test(message)) {
    return "Enter a valid Ghana mobile number (for example 0241234567).";
  }
  return message;
}

export default function RecordsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyIds = useRef<Set<string>>(new Set());
  const configured = isSupabaseConfigured();

  const [records, setRecords] = useState<Row[]>([]);
  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>("connecting");
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("constituency_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  const canEdit = role === "administrator" || role === "campaign_manager";
  const canDelete = role === "administrator";

  const showError = (message: string) => {
    setError(friendlyError(message));
    setSuccess("");
  };
  const showSuccess = (message: string) => {
    setSuccess(message);
    setError("");
  };

  // ---- Loading -------------------------------------------------------------

  const loadRecords = useCallback(async () => {
    if (!configured) return;
    const supabase = createBrowserSupabaseClient();
    const rows: DbRow[] = [];

    for (let from = 0; ; from += FETCH_SIZE) {
      const { data, error: queryError } = await supabase
        .from("administrative_records")
        .select(SELECT_COLUMNS)
        .order("created_at", { ascending: true })
        .range(from, from + FETCH_SIZE - 1);

      if (queryError) {
        showError(`Could not load delegates: ${queryError.message}`);
        return;
      }
      const page = (data ?? []) as unknown as DbRow[];
      rows.push(...page);
      if (page.length < FETCH_SIZE) break;
    }

    const fresh = rows.map(fromDb);
    // Keep rows the manager is still editing (not saved yet) instead of wiping them.
    setRecords((current) => {
      if (dirtyIds.current.size === 0) return fresh;
      const editing = new Map(current.filter((r) => dirtyIds.current.has(r.id)).map((r) => [r.id, r]));
      return fresh.map((r) => editing.get(r.id) ?? r);
    });
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    let isMounted = true;
    const supabase = createBrowserSupabaseClient();

    const checkUser = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (!userData.user) {
        setRole(null);
        setAuthChecked(true);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
      if (!isMounted) return;
      setRole((profile?.role as AppRole | undefined) ?? "executive_viewer");
      setAuthChecked(true);
    };

    const loadConstituencies = async () => {
      const { data } = await supabase.from("constituencies").select("id, name").order("name");
      if (isMounted && data) setConstituencies(data as Constituency[]);
    };

    const scheduleReload = () => {
      if (!isMounted) return;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        if (isMounted) void loadRecords();
      }, 300);
    };

    void checkUser();
    void loadConstituencies();
    void loadRecords();

    const channel = supabase
      .channel("records-panel-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "administrative_records" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "constituencies" }, () => void loadConstituencies())
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === "SUBSCRIBED") setLiveState("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveState("offline");
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void checkUser();
      scheduleReload();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted = false;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [configured, loadRecords]);

  useEffect(() => {
    if (!form.constituency_id && constituencies[0]) {
      setForm((current) => ({ ...current, constituency_id: constituencies[0].id }));
    }
  }, [constituencies, form.constituency_id]);

  // ---- Table helpers -------------------------------------------------------

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const next = records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.verification_status === statusFilter;
      const haystack = [record.full_name, record.constituency_name, record.phone, record.admin_note, record.verification_status]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    next.sort((a, b) => {
      if (sortKey === "updated_at") {
        return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * direction;
      }
      const primary = String(a[sortKey]).localeCompare(String(b[sortKey])) * direction;
      return primary !== 0 ? primary : a.full_name.localeCompare(b.full_name);
    });
    return next;
  }, [records, searchTerm, statusFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pageRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const counts = useMemo(
    () => ({
      green: records.filter((r) => r.verification_status === "green").length,
      yellow: records.filter((r) => r.verification_status === "yellow").length,
      red: records.filter((r) => r.verification_status === "red").length,
    }),
    [records],
  );

  const editRow = (id: string, changes: Partial<Row>) => {
    dirtyIds.current.add(id);
    forceRender((n) => n + 1);
    setRecords((current) => current.map((record) => (record.id === id ? { ...record, ...changes } : record)));
  };

  // ---- Colour change: saved immediately, shows on every dashboard ----------

  const handleStatusChange = async (recordId: string, value: string) => {
    if (!canEdit) return;
    const nextStatus = normalizeStatus(value);
    const previous = records.find((record) => record.id === recordId);
    if (!previous || previous.verification_status === nextStatus) return;

    // Show the new colour straight away; undo it if saving fails.
    setRecords((current) =>
      current.map((record) => (record.id === recordId ? { ...record, verification_status: nextStatus } : record)),
    );
    setSavingStatusId(recordId);

    const supabase = createBrowserSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setRecords((current) => current.map((record) => (record.id === recordId ? previous : record)));
      setSavingStatusId(null);
      showError("Your sign-in has expired. Please sign in again.");
      return;
    }

    const { data, error: updateError } = await supabase
      .from("administrative_records")
      .update({ verification_status: nextStatus, updated_by: userId })
      .eq("id", recordId)
      .select("updated_at")
      .single();

    setSavingStatusId(null);

    if (updateError) {
      setRecords((current) => current.map((record) => (record.id === recordId ? previous : record)));
      showError(updateError.message);
      return;
    }

    setRecords((current) =>
      current.map((record) => (record.id === recordId ? { ...record, updated_at: data?.updated_at ?? record.updated_at } : record)),
    );

    // History for the audit trail. If this fails, the colour is still saved.
    void supabase.from("verification_history").insert({
      record_id: recordId,
      from_status: previous.verification_status,
      to_status: nextStatus,
      reason: "Status changed from the campaign manager panel",
      changed_by: userId,
    });
    void supabase.rpc("write_audit_event", {
      p_action: "verification.change",
      p_entity_type: "administrative_record",
      p_entity_id: recordId,
      p_metadata: { from: previous.verification_status, to: nextStatus },
    });

    showSuccess(`${previous.full_name} is now ${nextStatus.toUpperCase()}. All dashboards have been updated.`);
  };

  // ---- Other edits (name, position, phone, constituency) -------------------

  const handleSaveChanges = async () => {
    if (!canEdit) return;
    const ids = Array.from(dirtyIds.current);
    if (ids.length === 0) {
      showSuccess("There are no unsaved changes.");
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        showError("Your sign-in has expired. Please sign in again.");
        return;
      }

      for (const id of ids) {
        const row = records.find((record) => record.id === id);
        if (!row) {
          dirtyIds.current.delete(id);
          continue;
        }
        const name = row.full_name.trim().replace(/\s+/g, " ");
        if (name.length < 2) {
          showError("Every delegate needs a name of at least 2 letters.");
          return;
        }
        const phone = row.phone.trim() ? toPhone(row.phone) : null;
        if (row.phone.trim() && !phone) {
          showError(`${name}: enter a valid Ghana mobile number (for example 0241234567).`);
          return;
        }

        const { error: updateError } = await supabase
          .from("administrative_records")
          .update({
            full_name: name,
            constituency_id: row.constituency_id,
            phone_e164: phone,
            admin_note: row.admin_note.trim() || null,
            updated_by: userId,
          })
          .eq("id", id);

        if (updateError) {
          showError(`${name}: ${friendlyError(updateError.message)}`);
          return;
        }
        dirtyIds.current.delete(id);
      }

      forceRender((n) => n + 1);
      await loadRecords();
      showSuccess("Changes saved. All dashboards have been updated.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = async () => {
    dirtyIds.current.clear();
    forceRender((n) => n + 1);
    await loadRecords();
    showSuccess("Unsaved changes discarded.");
  };

  // ---- Add / delete --------------------------------------------------------

  const handleAddRecord = async () => {
    if (!canEdit) return;
    const name = form.full_name.trim().replace(/\s+/g, " ");
    const phone = toPhone(form.phone);

    if (name.length < 2) return showError("Full name is required.");
    if (!form.constituency_id) return showError("Select a constituency.");
    if (!phone) return showError("Enter a valid Ghana mobile number (for example 0241234567).");
    if (records.some((r) => r.phone === phone)) return showError("Another delegate already has this phone number.");
    if (records.some((r) => r.constituency_id === form.constituency_id && r.full_name.toLowerCase() === name.toLowerCase())) {
      return showError("This person is already listed in this constituency.");
    }

    setIsSaving(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return showError("Your sign-in has expired. Please sign in again.");

      const { error: insertError } = await supabase.from("administrative_records").insert({
        full_name: name,
        constituency_id: form.constituency_id,
        phone_e164: phone,
        gender: form.gender || null,
        verification_status: form.verification_status,
        admin_note: form.admin_note.trim() || null,
        created_by: userId,
        updated_by: userId,
      });

      if (insertError) return showError(insertError.message);

      setForm({ ...EMPTY_FORM, constituency_id: form.constituency_id });
      await loadRecords();
      showSuccess(`${name} added. All dashboards have been updated.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRow = async (record: Row) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete ${record.full_name} (${record.constituency_name})? This cannot be undone.`)) return;

    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from("administrative_records").delete().eq("id", record.id);
    if (deleteError) return showError(deleteError.message);

    dirtyIds.current.delete(record.id);
    setRecords((current) => current.filter((r) => r.id !== record.id));
    showSuccess(`${record.full_name} deleted.`);
  };

  // ---- Spreadsheet import --------------------------------------------------
  // Works with the campaign's layout (constituency written once above its
  // people, then name / position / phone) and with a normal one-row-per-person
  // sheet that has Name, Constituency, Phone, Position and Status columns.

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canEdit) return;

    setIsImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      if (grid.length < 2) return showError("The spreadsheet is empty.");

      const header = (grid[0] as unknown[]).map((cell) => String(cell).trim().toLowerCase());
      const findCol = (test: (h: string) => boolean) => header.findIndex(test);
      const colConstituency = findCol((h) => h.includes("constituenc"));
      const colPhone = findCol((h) => /phone|phome|tel|numb/.test(h));
      const colPosition = findCol((h) => /position|note|role/.test(h));
      const colStatus = findCol((h) => /status|colou?r/.test(h));
      let colName = findCol((h) => h.includes("name") && !h.includes("constituenc"));
      if (colName === -1) colName = header.findIndex((h, i) => h === "" && i !== colConstituency);

      if (colConstituency === -1 || colName === -1 || colPhone === -1) {
        return showError("Could not find the Constituency, Name and Phone columns in this spreadsheet.");
      }

      const byKey = new Map(constituencies.map((c) => [nameKey(c.name), c]));
      const existingPhones = new Set(records.map((r) => r.phone).filter(Boolean));
      const problems: string[] = [];
      const toInsert: Array<Record<string, unknown>> = [];
      let currentConstituency = "";
      let skippedExisting = 0;

      grid.slice(1).forEach((rawRow, index) => {
        const row = rawRow as unknown[];
        const cell = (col: number) => (col >= 0 ? String(row[col] ?? "").trim().replace(/\s+/g, " ") : "");
        if (cell(colConstituency)) currentConstituency = cell(colConstituency);
        const name = cell(colName);
        if (!name) return;

        const rowNumber = index + 2;
        const constituency = byKey.get(nameKey(currentConstituency));
        const phone = toPhone(cell(colPhone));
        if (!constituency) return problems.push(`Row ${rowNumber}: unknown constituency "${currentConstituency}"`);
        if (!phone) return problems.push(`Row ${rowNumber}: invalid phone number for ${name}`);
        if (existingPhones.has(phone)) {
          skippedExisting += 1;
          return;
        }
        existingPhones.add(phone);
        toInsert.push({
          full_name: name,
          constituency_id: constituency.id,
          phone_e164: phone,
          admin_note: cell(colPosition) || null,
          verification_status: colStatus >= 0 ? normalizeStatus(cell(colStatus)) : "yellow",
        });
      });

      if (toInsert.length === 0) {
        return showError(
          [`No new delegates to add${skippedExisting ? ` (${skippedExisting} already in the database)` : ""}.`, ...problems.slice(0, 5)].join(" "),
        );
      }

      const supabase = createBrowserSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return showError("Your sign-in has expired. Please sign in again.");

      const { error: insertError } = await supabase
        .from("administrative_records")
        .insert(toInsert.map((row) => ({ ...row, created_by: userId, updated_by: userId })));
      if (insertError) return showError(insertError.message);

      await loadRecords();
      const extra = [
        skippedExisting ? `${skippedExisting} were already in the database.` : "",
        problems.length ? `${problems.length} rows skipped: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "…" : ""}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      showSuccess(`${toInsert.length} delegates imported. ${extra}`.trim());
    } catch (errorObject) {
      showError(errorObject instanceof Error ? errorObject.message : "Unable to import the spreadsheet.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---- Screens -------------------------------------------------------------

  if (!configured) {
    return (
      <Notice title="Database not connected">
        Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the website.
      </Notice>
    );
  }

  if (authChecked && !role) {
    return (
      <Notice title="Please sign in">
        You need to sign in with your campaign account to manage delegates.{" "}
        <a href="/login" className="font-semibold text-blue-700 underline">
          Go to sign in
        </a>
      </Notice>
    );
  }

  const unsavedCount = dirtyIds.current.size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Records</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Delegate database</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <LiveBadge state={liveState} />
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{counts.green} green</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{counts.yellow} yellow</span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">{counts.red} red</span>
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              {isImporting ? "Importing..." : "Import CSV / XLSX"}
            </Button>
            {unsavedCount > 0 ? (
              <Button type="button" variant="outline" onClick={() => void handleDiscardChanges()} disabled={isSaving}>
                Discard
              </Button>
            ) : null}
            <Button type="button" onClick={() => void handleSaveChanges()} disabled={isSaving || unsavedCount === 0}>
              {isSaving ? "Saving..." : unsavedCount > 0 ? `Save ${unsavedCount} change${unsavedCount === 1 ? "" : "s"}` : "No unsaved changes"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          </div>
        ) : null}
      </div>

      {authChecked && !canEdit ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You can view delegates. Only the campaign manager and administrators can change colours or details.
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</div>
      ) : null}

      <div className={canEdit ? "grid gap-6 xl:grid-cols-[0.95fr_1.4fr]" : ""}>
        {canEdit ? (
          <form
            className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddRecord();
            }}
          >
            <div className="mb-4">
              <p className="text-lg font-semibold text-slate-900">Add delegate</p>
              <p className="text-sm text-slate-500">Saved straight to the live database.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-name">Full name</Label>
                <Input
                  id="new-name"
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                  placeholder="Enter delegate name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-constituency">Constituency</Label>
                <select
                  id="new-constituency"
                  value={form.constituency_id}
                  onChange={(event) => setForm((current) => ({ ...current, constituency_id: event.target.value }))}
                  className={SELECT_CLASS}
                >
                  {constituencies.map((constituency) => (
                    <option key={constituency.id} value={constituency.id}>
                      {constituency.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-phone">Telephone number</Label>
                <Input
                  id="new-phone"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="0241234567"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-gender">Gender</Label>
                  <select
                    id="new-gender"
                    value={form.gender}
                    onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as Gender }))}
                    className={SELECT_CLASS}
                  >
                    <option value="">Select gender</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-status">Status</Label>
                  <select
                    id="new-status"
                    value={form.verification_status}
                    onChange={(event) => setForm((current) => ({ ...current, verification_status: event.target.value as Status }))}
                    className={SELECT_CLASS}
                  >
                    <option value="yellow">Yellow</option>
                    <option value="green">Green</option>
                    <option value="red">Red</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-note">Position</Label>
                <Textarea
                  id="new-note"
                  value={form.admin_note}
                  onChange={(event) => setForm((current) => ({ ...current, admin_note: event.target.value }))}
                  placeholder="e.g. Youth Organizer"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={isSaving}>
                Add delegate
              </Button>
            </div>
          </form>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-lg font-semibold text-slate-900">All delegates</p>
            <p className="text-sm text-slate-500">
              {canEdit
                ? "Change a colour and it is saved instantly for everyone. Edits to names, positions and phones need “Save”."
                : "Search and filter delegates."}
            </p>
          </div>

          <div className="mb-4 flex flex-col gap-3 md:flex-row">
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name, phone, constituency..." />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className={`${SELECT_CLASS} md:w-auto md:min-w-[180px]`}
            >
              <option value="all">All statuses</option>
              <option value="green">Green</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {(
                    [
                      { key: "full_name", label: "Full name" },
                      { key: "constituency_name", label: "Constituency" },
                      { key: "admin_note", label: "Position" },
                      { key: "phone", label: "Telephone" },
                      { key: "verification_status", label: "Status" },
                      { key: "updated_at", label: "Last updated" },
                    ] as Array<{ key: SortKey; label: string }>
                  ).map((header) => (
                    <th key={header.key} className="border-b border-slate-200 px-3 py-3 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-left"
                        onClick={() => {
                          if (sortKey === header.key) {
                            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                          } else {
                            setSortKey(header.key);
                            setSortDirection("asc");
                          }
                        }}
                      >
                        {header.label}
                        {sortKey === header.key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  {canDelete ? <th className="border-b border-slate-200 px-3 py-3 font-medium">Actions</th> : null}
                </tr>
              </thead>

              <tbody>
                {pageRecords.length === 0 ? (
                  <tr>
                    <td colSpan={canDelete ? 7 : 6} className="px-3 py-10 text-center text-slate-500">
                      {records.length === 0 ? "No delegates in the database yet." : "No delegates match the current search or filter."}
                    </td>
                  </tr>
                ) : (
                  pageRecords.map((record) => {
                    const isDirty = dirtyIds.current.has(record.id);
                    return (
                      <tr key={record.id} className={`border-b border-slate-100 align-top ${isDirty ? "bg-amber-50/50" : ""}`}>
                        <td className="px-3 py-2">
                          <Input
                            value={record.full_name}
                            disabled={!canEdit}
                            onChange={(event) => editRow(record.id, { full_name: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={record.constituency_id}
                            disabled={!canEdit}
                            onChange={(event) =>
                              editRow(record.id, {
                                constituency_id: event.target.value,
                                constituency_name: constituencies.find((c) => c.id === event.target.value)?.name ?? "Unassigned",
                              })
                            }
                            className={SELECT_CLASS}
                          >
                            {constituencies.map((constituency) => (
                              <option key={constituency.id} value={constituency.id}>
                                {constituency.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={record.admin_note}
                            disabled={!canEdit}
                            onChange={(event) => editRow(record.id, { admin_note: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={record.phone}
                            disabled={!canEdit}
                            onChange={(event) => editRow(record.id, { phone: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={record.verification_status}
                            disabled={!canEdit || savingStatusId === record.id}
                            onChange={(event) => void handleStatusChange(record.id, event.target.value)}
                            className={`${SELECT_CLASS} font-semibold ${STATUS_SELECT_TONE[record.verification_status]}`}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status === "green" ? "🟢 Green" : status === "yellow" ? "🟡 Yellow" : "🔴 Red"}
                              </option>
                            ))}
                          </select>
                          {savingStatusId === record.id ? <p className="mt-1 text-xs text-slate-500">Saving…</p> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {new Date(record.updated_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        {canDelete ? (
                          <td className="px-3 py-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteRow(record)}>
                              Delete
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Showing {filteredRecords.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} -{" "}
              {Math.min(currentPage * PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
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
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-semibold ring-1 ${config.tone}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
