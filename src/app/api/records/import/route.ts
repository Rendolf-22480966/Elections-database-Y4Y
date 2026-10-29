import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { DEMO_CONSTITUENCIES, type DemoRecord } from "@/lib/demo-data";
import { normalizeGhanaPhone } from "@/lib/phone";

function pickValue(row: Record<string, unknown>, candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => ({
    original: candidate,
    normalized: candidate.replace(/[_\s.-]+/g, "").toLowerCase(),
  }));

  for (const candidate of normalizedCandidates) {
    const value = row[candidate.original] ?? row[candidate.original.toLowerCase()] ?? row[candidate.original.toUpperCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  for (const [name, value] of Object.entries(row)) {
    const normalizedName = name.replace(/[_\s.-]+/g, "").toLowerCase();
    if (normalizedCandidates.some((candidate) => candidate.normalized === normalizedName || candidate.normalized === `${normalizedName}s` || normalizedName === `${candidate.normalized}s`)) {
      const text = String(value ?? "").trim();
      if (text) return text;
    }
  }

  return "";
}

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

function normalizePersonName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([A-Za-z])([A-Za-z'-]*)\b/g, (match, first, rest) => first.toUpperCase() + rest.toLowerCase());
}

function findConstituencyName(raw: string) {
  const candidate = raw.trim();
  if (!candidate) return "Akwatia";

  const normalizedCandidate = normalizeConstituencyToken(candidate);

  const match = DEMO_CONSTITUENCIES.find((item) => {
    const normalizedName = normalizeConstituencyToken(item.name);
    const normalizedCode = normalizeConstituencyToken(item.code);
    return normalizedName === normalizedCandidate || normalizedCode === normalizedCandidate || normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName);
  });

  return match?.name ?? candidate;
}

function normalizeStatus(value: string): DemoRecord["verification_status"] {
  const cleaned = value.toLowerCase().trim();
  if (cleaned.includes("verified")) return "verified";
  if (cleaned.includes("requires") || cleaned.includes("correction")) return "requires_correction";
  return "pending";
}

async function findWorkbookFile() {
  const dirs = [process.cwd(), path.join(process.cwd(), "public")];

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const candidates = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((fileName) => /\.(xlsx|xls|csv)$/i.test(fileName));

      const preferredExact = candidates.find((fileName) => fileName.toLowerCase().includes("elections updated"));
      const preferred = preferredExact ?? candidates.find((fileName) => /election|youth|delegate|regional|region/i.test(fileName)) ?? candidates[0];
      if (preferred) {
        return path.join(dir, preferred);
      }
    } catch {
      // Ignore unreadable directories and keep scanning.
    }
  }

  const root = process.cwd();
  const fallbackMatches = await fs.readdir(root, { withFileTypes: true }).catch(() => []).then((entries) =>
    entries
      .filter((entry) => entry.isFile() && /\.(xlsx|xls|csv)$/i.test(entry.name))
      .map((entry) => path.join(root, entry.name)),
  );

  return fallbackMatches[0] ?? null;
}

async function getReadableWorkbookPath(filePath: string) {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return filePath;
  } catch {
    const tempDir = path.join(process.cwd(), ".tmp-import");
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, path.basename(filePath));

    try {
      await fs.copyFile(filePath, tempPath);
      return tempPath;
    } catch {
      return filePath;
    }
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";
    const filePath = await findWorkbookFile();
    if (!filePath) {
      return NextResponse.json({ records: [], source: null }, { status: 404 });
    }

    const readableFilePath = await getReadableWorkbookPath(filePath);
    const fileBuffer = await fs.readFile(readableFilePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return NextResponse.json({ records: [], source: path.basename(filePath) }, { status: 404 });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });

    if (debug) {
      return NextResponse.json({
        source: path.basename(filePath),
        rows: rows.slice(0, 12),
        headers: rows[0] ? Object.keys(rows[0]) : [],
      }, { status: 200 });
    }

    let lastConstituency = "";

    const records: DemoRecord[] = rows
      .map((row, index) => {
        const fullNameRaw = pickValue(row, [
          "__EMPTY",
          "full_name",
          "full name",
          "name",
          "names",
          "member_name",
          "delegate_name",
          "constituency_officer",
          "officer_name",
          "officer",
          "official_name",
          "person_name",
          "Name",
        ]);
        const fullName = normalizePersonName(fullNameRaw);
        const rawConstituency = pickValue(row, [
          "Constituencies ",
          "Constituencies",
          "constituency",
          "constituency_name",
          "constituency name",
          "district",
          "region",
          "area",
          "ward",
          "electoral_area",
          "constituency_name_of_focal_person",
        ]) || lastConstituency;
        lastConstituency = rawConstituency || lastConstituency;

        const rawPhone = pickValue(row, [
          "Phome. Numbrr ",
          "Phome. Numbrr",
          "phone",
          "telephone",
          "telephone_number",
          "mobile",
          "phone_number",
          "contact_number",
          "phone number",
          "contact",
          "official_phone",
          "cell_number",
        ]);
        const rawGender = pickValue(row, ["gender", "sex"]);
        const rawPosition = pickValue(row, [
          "POSITION",
          "Position",
          "position",
          "position_held",
          "position held",
          "title",
          "role",
          "post",
          "designation",
          "office",
          "responsibility",
          "official_role",
        ]);
        const rawStatus = pickValue(row, ["verification_status", "verification status", "status", "record_status", "review_status"]);
        const rawNote = pickValue(row, ["admin_note", "administrative_note", "admin note", "notes", "comment"]) || rawPosition;

        if (!fullName) return null;

        const normalizedPhone = normalizeGhanaPhone(rawPhone) ?? (rawPhone ? rawPhone.replace(/[\s()-]/g, "") : "");
        const constituencyName = findConstituencyName(rawConstituency);
        const canonicalConstituencyName = DEMO_CONSTITUENCIES.find((item) => {
          const itemName = normalizeConstituencyToken(item.name);
          const candidateName = normalizeConstituencyToken(constituencyName);
          return itemName === candidateName || itemName.includes(candidateName) || candidateName.includes(itemName);
        })?.name ?? constituencyName;
        const constituency = DEMO_CONSTITUENCIES.find(
          (item) => item.name.toLowerCase() === canonicalConstituencyName.toLowerCase() || item.code.toLowerCase() === canonicalConstituencyName.toLowerCase(),
        );

        const fallbackConstituency = {
          id: `constituency_${String(index + 1).padStart(3, "0")}`,
          name: constituencyName || "Unassigned",
          code: constituencyName ? constituencyName.slice(0, 3).toUpperCase() : "UNK",
        };
        const selectedConstituency = constituency ?? fallbackConstituency;

        const gender = rawGender.toLowerCase().includes("female")
          ? "female"
          : rawGender.toLowerCase().includes("male")
            ? "male"
            : rawGender.toLowerCase().includes("other")
              ? "other"
              : "";

        const record: DemoRecord = {
          id: `import-${Date.now()}-${index}`,
          full_name: fullName,
          constituency_id: selectedConstituency.id,
          constituency_name: canonicalConstituencyName || selectedConstituency.name,
          phone: normalizedPhone,
          gender,
          verification_status: normalizeStatus(rawStatus || "pending"),
          admin_note: rawNote || `${constituencyName} officer`,
          created_by: "spreadsheet-import",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        return record;
      })
      .filter((record): record is DemoRecord => Boolean(record) && Boolean(record.full_name));

    return NextResponse.json({ records, source: path.basename(filePath) }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        records: [],
        error: error instanceof Error ? error.message : "Unable to import spreadsheet.",
      },
      { status: 500 },
    );
  }
}
