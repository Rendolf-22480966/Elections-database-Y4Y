import type { AppRole } from "@/lib/roles";
import { WORKBOOK_RECORDS } from "../../_workbook_records_gen";

export type DemoSession = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

export type DemoUser = DemoSession & {
  password: string;
};

export type DemoGender = "female" | "male" | "other" | "prefer_not_to_say";
export type DemoStatus = "green" | "yellow" | "red";

export type DemoRecord = {
  id: string;
  full_name: string;
  constituency_id: string;
  constituency_name: string;
  phone: string;
  gender: DemoGender | "";
  verification_status: DemoStatus;
  admin_note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DashboardSummary = {
  total: number;
  green: number;
  yellow: number;
  red: number;
  byConstituency: Array<{ name: string; count: number }>;
  byStatus: Array<{ status: DemoStatus; count: number }>;
  recentRecords: DemoRecord[];
};

export function normalizeDemoStatus(value: string | null | undefined): DemoStatus {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "green" || normalized === "verified") return "green";
  if (normalized === "yellow" || normalized === "pending") return "yellow";
  if (normalized === "red" || normalized === "requires_correction" || normalized === "requires correction" || normalized === "needs_correction" || normalized === "needs correction") return "red";

  return "yellow";
}

export function getStatusLabel(value: string | null | undefined): string {
  switch (normalizeDemoStatus(value)) {
    case "green":
      return "Green";
    case "red":
      return "Red";
    case "yellow":
    default:
      return "Yellow";
  }
}

function createConstituencyUuid(name: string) {
  const cleaned = name.trim().toLowerCase();
  let hash = 2166136261;

  for (let index = 0; index < cleaned.length; index += 1) {
    hash ^= cleaned.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = ((hash >>> ((index % 4) * 8)) & 0xff) ^ ((cleaned.charCodeAt(index % cleaned.length) + index * 13) & 0xff);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const EASTERN_REGION_CONSTITUENCIES: Array<{ id: string; name: string; code: string }> = [
  { id: createConstituencyUuid("Suhum"), name: "Suhum", code: "E1101" },
  { id: createConstituencyUuid("Ayensuano"), name: "Ayensuano", code: "E1201" },
  { id: createConstituencyUuid("Mpraeso"), name: "Mpraeso", code: "E3001" },
  { id: createConstituencyUuid("Achiase"), name: "Achiase", code: "E1801" },
  { id: createConstituencyUuid("Abuakwa north"), name: "Abuakwa north", code: "E2401" },
  { id: createConstituencyUuid("Ofoase Ayerebi"), name: "Ofoase Ayerebi", code: "E1901" },
  { id: createConstituencyUuid("New juaben south"), name: "New juaben south", code: "E0501" },
  { id: createConstituencyUuid("Abetifi"), name: "Abetifi", code: "E2601" },
  { id: createConstituencyUuid("Akim swedru"), name: "Akim swedru", code: "E1401" },
  { id: createConstituencyUuid("Akim Oda"), name: "Akim Oda", code: "E1501" },
  { id: createConstituencyUuid("Afram plains north"), name: "Afram plains north", code: "E4201" },
  { id: createConstituencyUuid("Afram plains south"), name: "Afram plains south", code: "E4301" },
  { id: createConstituencyUuid("Lower west Akim"), name: "Lower west Akim", code: "E1301" },
  { id: createConstituencyUuid("Lower manya krobo"), name: "Lower manya krobo", code: "E0201" },
  { id: createConstituencyUuid("Yilo krobo"), name: "Yilo krobo", code: "E0401" },
  { id: createConstituencyUuid("Kade"), name: "Kade", code: "E2001" },
  { id: createConstituencyUuid("New juaben North"), name: "New juaben North", code: "E0601" },
  { id: createConstituencyUuid("Akuapem south"), name: "Akuapem south", code: "E2301" },
  { id: createConstituencyUuid("Abuakwa south"), name: "Abuakwa south", code: "E2301" },
  { id: createConstituencyUuid("Asougyaman"), name: "Asougyaman", code: "E1601" },
  { id: createConstituencyUuid("Akwatia"), name: "Akwatia", code: "E2101" },
  { id: createConstituencyUuid("Asene manso akroso"), name: "Asene manso akroso", code: "E1601" },
  { id: createConstituencyUuid("Fanteakwa north"), name: "Fanteakwa north", code: "E2701" },
  { id: createConstituencyUuid("Atiwa East"), name: "Atiwa East", code: "E2601" },
  { id: createConstituencyUuid("Atiwa west"), name: "Atiwa west", code: "E2501" },
  { id: createConstituencyUuid("Fanteakwa south"), name: "Fanteakwa south", code: "E2801" },
  { id: createConstituencyUuid("Upper west Akim"), name: "Upper west Akim", code: "E1401" },
  { id: createConstituencyUuid("Nsawam"), name: "Nsawam", code: "E1001" },
  { id: createConstituencyUuid("Akuapem North"), name: "Akuapem North", code: "E2401" },
  { id: createConstituencyUuid("Nkawkaw"), name: "Nkawkaw", code: "E2901" },
  { id: createConstituencyUuid("Abirem"), name: "Abirem", code: "E2201" },
  { id: createConstituencyUuid("Okere"), name: "Okere", code: "E0801" },
  { id: createConstituencyUuid("Upper Manya Krobo"), name: "Upper Manya Krobo", code: "E0301" },
];

export const DEMO_CONSTITUENCIES = EASTERN_REGION_CONSTITUENCIES;

const DEFAULT_DEMO_USERS: DemoUser[] = [
  {
    id: "admin-1",
    name: "Rendolf Agyemang",
    email: "rendolfagyemang2@gmail.com",
    password: "Rendolf488$",
    role: "administrator",
  },
  {
    id: "admin-2",
    name: "Abdulai Idrisu",
    email: "abdulaiiddrisu78@gmail.com",
    password: "12345678",
    role: "administrator",
  },
];

export const ADMIN_ONLY_EMAIL = "abdulaiiddrisu78@gmail.com";
export const ADMIN_ONLY_PASSWORD = "12345678";

export function isAdminOnlyLogin(email: string, password: string) {
  return email.trim().toLowerCase() === ADMIN_ONLY_EMAIL && password === ADMIN_ONLY_PASSWORD;
}

export function isAdminOnlyEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ADMIN_ONLY_EMAIL;
}

export const DEMO_USERS = DEFAULT_DEMO_USERS;

const constituencyId = (name: string) =>
  EASTERN_REGION_CONSTITUENCIES.find((constituency) => constituency.name.toLowerCase() === name.toLowerCase())?.id ?? createConstituencyUuid(name);

export const DEMO_RECORDS: DemoRecord[] = WORKBOOK_RECORDS.map((record) => ({
  ...record,
  verification_status: normalizeDemoStatus(record.verification_status),
  created_at: record.created_at || new Date().toISOString(),
  updated_at: record.updated_at || record.created_at || new Date().toISOString(),
}));

export const DEMO_SESSION_KEY = "election-delegate-session";
export const DEMO_RECORDS_KEY = "election-delegate-records";

export function getDemoSession(): DemoSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const session = window.localStorage.getItem(DEMO_SESSION_KEY);
  if (!session) return null;

  try {
    return JSON.parse(session) as DemoSession;
  } catch {
    return null;
  }
}

export function notifyDemoSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("election-demo-session-changed"));
}

export function saveDemoSession(session: DemoSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  notifyDemoSessionChanged();
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_SESSION_KEY);
  notifyDemoSessionChanged();
}

function sanitizeDemoRecord(record: DemoRecord): DemoRecord {
  const match = DEMO_CONSTITUENCIES.find((constituency) => {
    const sameId = constituency.id === record.constituency_id;
    const sameName = constituency.name.toLowerCase() === (record.constituency_name || "").trim().toLowerCase();
    return sameId || sameName;
  });

  if (!match) {
    return record;
  }

  return {
    ...record,
    constituency_id: match.id,
    constituency_name: match.name,
  };
}

export function getDemoRecords(): DemoRecord[] {
  if (typeof window === "undefined") {
    return DEMO_RECORDS;
  }

  const raw = window.localStorage.getItem(DEMO_RECORDS_KEY);
  if (!raw) {
    window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(DEMO_RECORDS));
    return DEMO_RECORDS;
  }

  try {
    const parsed = JSON.parse(raw) as DemoRecord[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(DEMO_RECORDS));
      return DEMO_RECORDS;
    }

    const sanitized = parsed.map(sanitizeDemoRecord);
    if (JSON.stringify(sanitized) !== JSON.stringify(parsed)) {
      window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(DEMO_RECORDS));
    return DEMO_RECORDS;
  }
}

export function notifyDemoRecordsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("election-delegate-records-changed"));
}

export function saveDemoRecords(records: DemoRecord[]) {
  if (typeof window === "undefined") return;
  const nextRecords = Array.isArray(records) && records.length > 0 ? records : DEMO_RECORDS;
  window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(nextRecords));
  notifyDemoRecordsChanged();
}

export function getDashboardSummary(records: DemoRecord[]): DashboardSummary {
  const total = records.length;
  const green = records.filter((record) => record.verification_status === "green").length;
  const yellow = records.filter((record) => record.verification_status === "yellow").length;
  const red = records.filter((record) => record.verification_status === "red").length;

  const byConstituency = EASTERN_REGION_CONSTITUENCIES.map((constituency) => ({
    name: constituency.name,
    count: records.filter((record) => record.constituency_name.toLowerCase() === constituency.name.toLowerCase()).length,
  }));

  const byStatus: Array<{ status: DemoStatus; count: number }> = [
    { status: "green", count: green },
    { status: "yellow", count: yellow },
    { status: "red", count: red },
  ];

  return {
    total,
    green,
    yellow,
    red,
    byConstituency,
    byStatus,
    recentRecords: [...records].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
  };
}

export function getDemoUsers(): DemoUser[] {
  const fallbackUsers = DEMO_USERS;

  if (typeof window === "undefined") {
    return fallbackUsers;
  }

  const raw = window.localStorage.getItem("election-demo-users");
  if (!raw) {
    window.localStorage.setItem("election-demo-users", JSON.stringify(fallbackUsers));
    return fallbackUsers;
  }

  try {
    const parsed = JSON.parse(raw) as DemoUser[];
    const merged = [...fallbackUsers, ...(Array.isArray(parsed) ? parsed : [])];
    const byEmail = new Map<string, DemoUser>();

    for (const user of merged) {
      if (!user?.email) continue;
      byEmail.set(user.email.toLowerCase(), {
        ...user,
        email: user.email.trim(),
        name: user.name?.trim() || user.email,
      });
    }

    const nextUsers = Array.from(byEmail.values());
    if (JSON.stringify(nextUsers) !== JSON.stringify(parsed ?? [])) {
      window.localStorage.setItem("election-demo-users", JSON.stringify(nextUsers));
    }

    return nextUsers.length ? nextUsers : fallbackUsers;
  } catch {
    window.localStorage.setItem("election-demo-users", JSON.stringify(fallbackUsers));
    return fallbackUsers;
  }
}

export function saveDemoUsers(users: DemoUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("election-demo-users", JSON.stringify(users));
}

export function registerDemoUser(user: DemoUser) {
  const users = getDemoUsers();
  const nextUsers = [...users, user];
  saveDemoUsers(nextUsers);
}

export function isDemoUser(email: string, password: string) {
  return getDemoUsers().some((user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password);
}

export function getDemoUserByEmail(email: string) {
  return getDemoUsers().find((user) => user.email.toLowerCase() === email.toLowerCase());
}
