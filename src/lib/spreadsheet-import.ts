import { DEMO_CONSTITUENCIES, type DemoRecord } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function normalizeConstituencyToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([A-Za-z])([A-Za-z'-]*)\b/g, (match, first, rest) => first.toUpperCase() + rest.toLowerCase());
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function loadImportedRecords(): Promise<DemoRecord[]> {
  try {
    const response = await fetch("/api/records/import", { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { records?: DemoRecord[] };
    return Array.isArray(payload.records) ? payload.records : [];
  } catch {
    return [];
  }
}

export async function syncImportedRecordsToSupabase(records: DemoRecord[]) {
  if (!records.length || !isSupabaseConfigured()) {
    return false;
  }

  const supabase = createBrowserSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return false;
  }

  const { data: constituencyRows, error: constituencyError } = await supabase.from("constituencies").select("id, name");
  if (constituencyError || !constituencyRows) {
    return false;
  }

  const constituencyMap = new Map(
    constituencyRows.map((row) => [normalizeConstituencyToken(row.name), row.id]),
  );

  const payload = records
    .filter((record) => record.full_name && record.phone)
    .map((record, index) => {
      const lookupName = normalizeConstituencyToken(record.constituency_name || "");
      const constituencyId = constituencyMap.get(lookupName) ?? constituencyRows.find((row) => {
        const candidate = normalizeConstituencyToken(row.name);
        return candidate === lookupName || candidate.includes(lookupName) || lookupName.includes(candidate);
      })?.id;

      const match = DEMO_CONSTITUENCIES.find((item) => {
        const itemName = normalizeConstituencyToken(item.name);
        const candidateName = normalizeConstituencyToken(record.constituency_name || item.name);
        return itemName === candidateName || candidateName.includes(itemName) || itemName.includes(candidateName);
      });

      const recordId = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.test(record.id)
        ? record.id
        : `import-${Date.now()}-${index}`;

      const safeConstituencyId = constituencyId || match?.id || (isValidUuid(record.constituency_id) ? record.constituency_id : null);

      return {
        id: recordId,
        full_name: normalizeName(record.full_name),
        constituency_id: safeConstituencyId,
        phone_e164: record.phone,
        gender: record.gender || null,
        verification_status: record.verification_status,
        admin_note: record.admin_note || null,
        created_by: user.id,
        updated_by: user.id,
        created_at: record.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row) => Boolean(row.constituency_id) && isValidUuid(String(row.constituency_id)));

  if (!payload.length) {
    return false;
  }

  const { error } = await supabase.from("administrative_records").upsert(payload, { onConflict: "phone_e164" });
  return !error;
}
