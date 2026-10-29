"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEMO_CONSTITUENCIES, getDemoRecords, saveDemoRecords, type DemoRecord } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { normalizeGhanaPhone } from "@/lib/phone";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loadImportedRecords } from "@/lib/spreadsheet-import";

type SortKey = "full_name" | "constituency_name" | "phone" | "verification_status" | "created_at" | "updated_at";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "verified" | "pending" | "requires_correction";

type ImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string>;
  valid: boolean;
  issue?: string;
};

const PAGE_SIZE = 10;

type ConstituencyOption = {
  id: string;
  name: string;
  code?: string;
};

type RecordFormValues = {
  full_name: string;
  constituency_id: string;
  phone: string;
  gender: DemoRecord["gender"];
  verification_status: DemoRecord["verification_status"];
  admin_note: string;
};

const EMPTY_FORM: RecordFormValues = {
  full_name: "",
  constituency_id: DEMO_CONSTITUENCIES[0]?.id ?? "",
  phone: "",
  gender: "",
  verification_status: "pending",
  admin_note: "",
};

type LiveRecordRow = {
  id: string;
  full_name: string;
  constituency_id: string;
  phone_e164: string | null;
  gender: string | null;
  verification_status: DemoRecord["verification_status"];
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  constituencies: { name: string }[] | null;
};

function normalizePhoneValue(value: string) {
  return normalizeGhanaPhone(value.trim()) ?? "";
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getRandomRecordId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getConstituencyNameById(id: string, constituencyList: ConstituencyOption[] = DEMO_CONSTITUENCIES) {
  return constituencyList.find((constituency) => constituency.id === id)?.name ?? "Unassigned";
}

function rowMatchesDraft(row: DemoRecord, draft: DemoRecord, currentId?: string) {
  if (currentId && row.id === currentId) {
    return false;
  }

  const normalizedPhone = normalizePhoneValue(draft.phone);
  const normalizedName = draft.full_name.trim().toLowerCase();
  const samePhone = normalizedPhone && normalizedPhone === normalizePhoneValue(row.phone);
  const sameNameConstituency =
    normalizedName &&
    row.full_name.trim().toLowerCase() === normalizedName &&
    row.constituency_id === draft.constituency_id;

  return samePhone || sameNameConstituency;
}

function validateDraft(record: DemoRecord, allRecords: DemoRecord[], currentId?: string, constituencyList: ConstituencyOption[] = DEMO_CONSTITUENCIES) {
  const trimmedName = record.full_name.trim();
  const normalizedPhone = normalizePhoneValue(record.phone);

  if (!trimmedName || trimmedName.length < 2) {
    return "Full name is required.";
  }

  if (!record.constituency_id || !getConstituencyNameById(record.constituency_id, constituencyList) || getConstituencyNameById(record.constituency_id, constituencyList) === "Unassigned") {
    return "Select a valid constituency.";
  }

  if (!normalizedPhone) {
    return "Enter a valid Ghana mobile number.";
  }

  if (!record.verification_status || !["verified", "pending", "requires_correction"].includes(record.verification_status)) {
    return "Choose a valid verification status.";
  }

  const duplicate = allRecords.some((existing) => rowMatchesDraft(existing, record, currentId));
  if (duplicate) {
    return "Duplicate record detected: matching phone number or same name in the same constituency.";
  }

  return "";
}

function mapSupabaseRows(rows: LiveRecordRow[]): DemoRecord[] {
  return rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    constituency_id: row.constituency_id,
    constituency_name: row.constituencies?.[0]?.name ?? "Unassigned",
    phone: row.phone_e164 ?? "",
    gender: (row.gender as DemoRecord["gender"]) ?? "",
    verification_status: row.verification_status,
    admin_note: row.admin_note ?? "",
    created_by: "supabase",
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  }));
}

export default function RecordsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [records, setRecords] = useState<DemoRecord[]>([]);
  const [constituencyOptions, setConstituencyOptions] = useState<ConstituencyOption[]>([...DEMO_CONSTITUENCIES]);
  const [form, setForm] = useState<RecordFormValues>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadRecords = async () => {
      const importedRecords = await loadImportedRecords();
      if (importedRecords.length > 0) {
        saveDemoRecords(importedRecords);
        setRecords(importedRecords);
        return;
      }

      if (isSupabaseConfigured()) {
        const supabase = createBrowserSupabaseClient();
        const [{ data, error: queryError }, { data: constituencyData, error: constituencyError }] = await Promise.all([
          supabase
            .from("administrative_records")
            .select("id, full_name, constituency_id, phone_e164, gender, verification_status, admin_note, created_at, updated_at, constituencies(name)")
            .order("created_at", { ascending: false }),
          supabase.from("constituencies").select("id, name, code").order("name"),
        ]);

        if (!constituencyError && constituencyData) {
          setConstituencyOptions(constituencyData.map((row) => ({ id: row.id, name: row.name, code: row.code })));
        }

        if (!queryError && data) {
          setRecords(mapSupabaseRows(data as LiveRecordRow[]));
          return;
        }
      }

      setRecords(getDemoRecords());
    };

    void loadRecords();
  }, []);

  useEffect(() => {
    if (!form.constituency_id && constituencyOptions[0]) {
      setForm((current) => ({ ...current, constituency_id: constituencyOptions[0].id }));
    }
  }, [constituencyOptions, form.constituency_id]);

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const next = records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.verification_status === statusFilter;
      const haystack = [record.full_name, record.constituency_name, record.phone, record.verification_status].join(" ").toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      return matchesStatus && matchesSearch;
    });

    next.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      const left = a[sortKey === "constituency_name" ? "constituency_name" : sortKey];
      const right = b[sortKey === "constituency_name" ? "constituency_name" : sortKey];

      if (typeof left === "string" && typeof right === "string") {
        return left.localeCompare(right) * direction;
      }

      const leftValue = new Date(left as string).getTime();
      const rightValue = new Date(right as string).getTime();
      return (leftValue - rightValue) * direction;
    });

    return next;
  }, [records, searchTerm, statusFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pageRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const updateRow = (id: string, field: keyof DemoRecord, value: string) => {
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== id) {
          return record;
        }

        const next = { ...record, [field]: value };
        if (field === "verification_status") {
          next.updated_at = new Date().toISOString();
        }
        return next;
      }),
    );
  };

  const handleAddRecord = async () => {
    const trimmedName = form.full_name.trim();
    const normalizedPhone = normalizePhoneValue(form.phone);

    if (!trimmedName || trimmedName.length < 2) {
      setError("Full name is required.");
      return;
    }

    if (!form.constituency_id) {
      setError("Select a constituency.");
      return;
    }

    if (!normalizedPhone) {
      setError("Enter a valid Ghana mobile number.");
      return;
    }

    const candidate: DemoRecord = {
      id: getRandomRecordId(),
      full_name: trimmedName,
      constituency_id: form.constituency_id,
      constituency_name: getConstituencyNameById(form.constituency_id, constituencyOptions),
      phone: normalizedPhone,
      gender: form.gender as DemoRecord["gender"],
      verification_status: form.verification_status,
      admin_note: form.admin_note.trim(),
      created_by: "admin-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const duplicateMessage = validateDraft(candidate, records, candidate.id, constituencyOptions);
    if (duplicateMessage) {
      setError(duplicateMessage);
      return;
    }

    const nextRecords = [candidate, ...records];

    if (isSupabaseConfigured()) {
      try {
        setIsSaving(true);
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("You must be signed in before adding a record.");
          return;
        }

        const payload = [{
          id: isValidUuid(candidate.id) ? candidate.id : getRandomRecordId(),
          full_name: candidate.full_name,
          constituency_id: candidate.constituency_id,
          phone_e164: normalizePhoneValue(candidate.phone),
          gender: candidate.gender || null,
          verification_status: candidate.verification_status,
          admin_note: candidate.admin_note || null,
          created_by: user.id,
          updated_by: user.id,
          created_at: candidate.created_at,
          updated_at: candidate.updated_at,
        }];

        const { error: saveError } = await supabase.from("administrative_records").upsert(payload, { onConflict: "id" });
        if (saveError) {
          setError(saveError.message);
          return;
        }

        const { data, error: queryError } = await supabase
          .from("administrative_records")
          .select("id, full_name, constituency_id, phone_e164, gender, verification_status, admin_note, created_at, updated_at, constituencies(name)")
          .order("created_at", { ascending: false });

        if (queryError) {
          setError(queryError.message);
          return;
        }

        setRecords(mapSupabaseRows(data as LiveRecordRow[]));
        setForm({ ...EMPTY_FORM, constituency_id: constituencyOptions[0]?.id ?? EMPTY_FORM.constituency_id });
        setError("");
        setSuccess("New delegate added to the live database.");
        return;
      } finally {
        setIsSaving(false);
      }
    }

    setRecords(nextRecords);
    saveDemoRecords(nextRecords);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("New delegate added to the working dataset.");
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const normalizedRows = records.map((record) => ({
        ...record,
        full_name: record.full_name.trim(),
        phone: normalizePhoneValue(record.phone),
        admin_note: record.admin_note.trim(),
        constituency_name: getConstituencyNameById(record.constituency_id, constituencyOptions),
        updated_at: new Date().toISOString(),
      }));

      for (const row of normalizedRows) {
        const validationMessage = validateDraft(row, normalizedRows, row.id, constituencyOptions);
        if (validationMessage) {
          setError(`${row.full_name || "This record"}: ${validationMessage}`);
          return;
        }
      }

      if (isSupabaseConfigured()) {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("You must be signed in to save records to Supabase.");
          return;
        }

        const payload = normalizedRows.map((row) => ({
          id: isValidUuid(row.id) ? row.id : getRandomRecordId(),
          full_name: row.full_name,
          constituency_id: row.constituency_id,
          phone_e164: normalizePhoneValue(row.phone),
          gender: row.gender || null,
          verification_status: row.verification_status,
          admin_note: row.admin_note || null,
          created_by: row.created_by === "supabase" || row.created_by === "admin-1" ? user.id : row.created_by || user.id,
          updated_by: user.id,
          created_at: row.created_at,
          updated_at: new Date().toISOString(),
        }));

        const { error: saveError } = await supabase.from("administrative_records").upsert(payload, { onConflict: "id" });

        if (saveError) {
          setError(saveError.message);
          return;
        }

        const { data, error: queryError } = await supabase
          .from("administrative_records")
          .select("id, full_name, constituency_id, phone_e164, gender, verification_status, admin_note, created_at, updated_at, constituencies(name)")
          .order("created_at", { ascending: false });

        if (queryError) {
          setError(queryError.message);
          return;
        }

        setRecords(mapSupabaseRows(data as LiveRecordRow[]));
        setSuccess("Changes saved to the database successfully.");
        return;
      }

      setRecords(normalizedRows);
      saveDemoRecords(normalizedRows);
      setSuccess("Changes saved successfully.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRow = async (id: string) => {
    const nextRecords = records.filter((record) => record.id !== id);

    if (isSupabaseConfigured() && isValidUuid(id)) {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.from("administrative_records").delete().eq("id", id);
      if (error) {
        setError(error.message);
        return;
      }
    }

    setRecords(nextRecords);
    if (!isSupabaseConfigured()) {
      saveDemoRecords(nextRecords);
    }
    setSuccess("Record removed from the working list.");
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setError("");
    setSuccess("");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

      const preview: ImportPreviewRow[] = rows.slice(0, 5).map((row, index) => {
        const normalized = {
          full_name: String(row.full_name ?? row.name ?? row["Full Name"] ?? "").trim(),
          constituency: String(row.constituency ?? row["Constituency"] ?? "").trim(),
          phone: String(row.phone ?? row.telephone ?? row["Telephone Number"] ?? "").trim(),
          status: String(row.verification_status ?? row.status ?? row["Verification Status"] ?? "pending").trim(),
          gender: String(row.gender ?? row["Gender"] ?? "").trim(),
          note: String(row.admin_note ?? row["Administrative Note"] ?? "").trim(),
        };

        const constituency = DEMO_CONSTITUENCIES.find((item) => item.name.toLowerCase() === normalized.constituency.toLowerCase());
        const normalizedPhone = normalizePhoneValue(normalized.phone);
        const valid = Boolean(normalized.full_name) && Boolean(constituency) && Boolean(normalizedPhone);

        return {
          rowNumber: index + 2,
          values: normalized,
          valid,
          issue: valid ? undefined : "Required fields missing or invalid constituency/phone number.",
        };
      });

      const validRows = rows.filter((row) => {
        const fullName = String(row.full_name ?? row.name ?? row["Full Name"] ?? "").trim();
        const constituency = String(row.constituency ?? row["Constituency"] ?? "").trim();
        const phone = String(row.phone ?? row.telephone ?? row["Telephone Number"] ?? "").trim();
        const status = String(row.verification_status ?? row.status ?? row["Verification Status"] ?? "pending").trim();
        return Boolean(fullName) && Boolean(DEMO_CONSTITUENCIES.find((item) => item.name.toLowerCase() === constituency.toLowerCase())) && Boolean(normalizePhoneValue(phone)) && ["verified", "pending", "requires_correction"].includes(status.toLowerCase() === "requires correction" ? "requires_correction" : status.toLowerCase());
      });

      setImportPreview(preview);

      if (!validRows.length) {
        setError("No valid records were found in the uploaded file. Check the required columns and values.");
        return;
      }

      const importedRecords: DemoRecord[] = validRows.map((row, index) => {
        const fullName = String(row.full_name ?? row.name ?? row["Full Name"] ?? "").trim();
        const constituencyName = String(row.constituency ?? row["Constituency"] ?? "").trim();
        const constituency = DEMO_CONSTITUENCIES.find((item) => item.name.toLowerCase() === constituencyName.toLowerCase());
        const phone = normalizePhoneValue(String(row.phone ?? row.telephone ?? row["Telephone Number"] ?? ""));
        const genderValue = String(row.gender ?? row["Gender"] ?? "").trim();
        const rawStatus = String(row.verification_status ?? row.status ?? row["Verification Status"] ?? "pending").trim();
        const verificationStatus = rawStatus.toLowerCase() === "requires correction" ? "requires_correction" : rawStatus.toLowerCase() as DemoRecord["verification_status"];

        return {
          id: `import-${Date.now()}-${index}`,
          full_name: fullName,
          constituency_id: constituency?.id ?? DEMO_CONSTITUENCIES[0].id,
          constituency_name: constituency?.name ?? DEMO_CONSTITUENCIES[0].name,
          phone,
          gender: genderValue || "",
          verification_status: verificationStatus,
          admin_note: String(row.admin_note ?? row["Administrative Note"] ?? "").trim(),
          created_by: "admin-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      const merged = [...importedRecords, ...records];
      setRecords(merged);
      saveDemoRecords(merged);
      setSuccess(`${importedRecords.length} new records imported successfully.`);
      setImportPreview([]);
    } catch (errorObject) {
      const message = errorObject instanceof Error ? errorObject.message : "Unable to import the spreadsheet.";
      setError(message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Records</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Delegate database</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import CSV / XLSX"}
          </Button>
          <Button type="button" onClick={handleSaveChanges} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.4fr]">
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAddRecord();
          }}
        >
          <div className="mb-4">
            <p className="text-lg font-semibold text-slate-900">Add record</p>
            <p className="text-sm text-slate-500">Create a new delegate record and save it to the current dataset.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Full name</Label>
              <Input id="new-name" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Enter delegate name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-constituency">Constituency</Label>
              <select
                id="new-constituency"
                value={form.constituency_id}
                onChange={(event) => setForm((current) => ({ ...current, constituency_id: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
              >
                {constituencyOptions.map((constituency) => (
                  <option key={constituency.id} value={constituency.id}>
                    {constituency.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-phone">Telephone number</Label>
              <Input id="new-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="0241234567" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-gender">Gender</Label>
                <select
                  id="new-gender"
                  value={form.gender}
                  onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                >
                  <option value="">Select gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-status">Verification status</Label>
                <select
                  id="new-status"
                  value={form.verification_status}
                  onChange={(event) => setForm((current) => ({ ...current, verification_status: event.target.value as DemoRecord["verification_status"] }))}
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                >
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="requires_correction">Requires correction</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-note">Administrative note</Label>
              <Textarea id="new-note" value={form.admin_note} onChange={(event) => setForm((current) => ({ ...current, admin_note: event.target.value }))} placeholder="Add context for the record." />
            </div>
          </div>

          {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
          {success ? <p className="mt-4 text-sm font-medium text-emerald-600">{success}</p> : null}

          <div className="mt-6 flex justify-end">
            <Button type="submit">Add record</Button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">Spreadsheet view</p>
              <p className="text-sm text-slate-500">Search, sort, filter, and edit delegate records.</p>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 md:flex-row">
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name, phone, constituency..." />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="flex h-10 min-w-[180px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
            >
              <option value="all">All statuses</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="requires_correction">Requires correction</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  {[
                    { key: "full_name", label: "Full name" },
                    { key: "constituency_name", label: "Constituency" },
                    { key: "admin_note", label: "Position" },
                    { key: "phone", label: "Telephone" },
                    { key: "verification_status", label: "Status" },
                    { key: "updated_at", label: "Last updated" },
                  ].map((header) => (
                    <th key={header.key} className="border-b border-slate-200 px-3 py-3 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-left"
                        onClick={() => {
                          if (sortKey === header.key) {
                            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
                          } else {
                            setSortKey(header.key as SortKey);
                            setSortDirection("asc");
                          }
                        }}
                      >
                        {header.label}
                        {sortKey === header.key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {pageRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                      No records match the current search or filter.
                    </td>
                  </tr>
                ) : (
                  pageRecords.map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <Input
                          value={record.full_name}
                          onChange={(event) => updateRow(record.id, "full_name", event.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={record.constituency_id}
                          onChange={(event) => {
                            updateRow(record.id, "constituency_id", event.target.value);
                            updateRow(record.id, "constituency_name", getConstituencyNameById(event.target.value));
                          }}
                          className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                        >
                          {DEMO_CONSTITUENCIES.map((constituency) => (
                            <option key={constituency.id} value={constituency.id}>
                              {constituency.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={record.admin_note}
                          onChange={(event) => updateRow(record.id, "admin_note", event.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={record.phone}
                          onChange={(event) => updateRow(record.id, "phone", event.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={record.verification_status}
                          onChange={(event) => updateRow(record.id, "verification_status", event.target.value)}
                          className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                        >
                          <option value="pending">Pending</option>
                          <option value="verified">Verified</option>
                          <option value="requires_correction">Requires correction</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {new Date(record.updated_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteRow(record.id)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Showing {filteredRecords.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {importPreview.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Import preview</p>
          <p className="mt-1 text-sm text-slate-500">Review the first rows before importing. Invalid rows are highlighted and skipped.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Constituency</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row) => (
                  <tr key={row.rowNumber} className={row.valid ? "border-b border-slate-100" : "border-b border-red-100 bg-red-50/40"}>
                    <td className="px-3 py-2">{row.rowNumber}</td>
                    <td className="px-3 py-2">{row.values.full_name || "—"}</td>
                    <td className="px-3 py-2">{row.values.constituency || "—"}</td>
                    <td className="px-3 py-2">{row.values.phone || "—"}</td>
                    <td className="px-3 py-2">{row.values.status || "pending"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.valid ? "Ready" : row.issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
