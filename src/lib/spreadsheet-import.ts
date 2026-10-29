import type { DemoRecord } from "@/lib/demo-data";

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
