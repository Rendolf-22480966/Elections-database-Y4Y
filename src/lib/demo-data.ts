import type { AppRole } from "@/lib/roles";

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
export type DemoStatus = "verified" | "pending" | "requires_correction";

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
  verified: number;
  pending: number;
  correction: number;
  byConstituency: Array<{ name: string; count: number }>;
  byStatus: Array<{ status: DemoStatus; count: number }>;
  recentRecords: DemoRecord[];
};

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
  { id: createConstituencyUuid("Abirem"), name: "Abirem", code: "E2201" },
  { id: createConstituencyUuid("Abuakwa North"), name: "Abuakwa North", code: "E2401" },
  { id: createConstituencyUuid("Abuakwa South"), name: "Abuakwa South", code: "E2301" },
  { id: createConstituencyUuid("Achiase"), name: "Achiase", code: "E1801" },
  { id: createConstituencyUuid("Akwatia"), name: "Akwatia", code: "E2101" },
  { id: createConstituencyUuid("Asene-Manso-Akroso"), name: "Asene-Manso-Akroso", code: "E1601" },
  { id: createConstituencyUuid("Atewa East"), name: "Atewa East", code: "E2601" },
  { id: createConstituencyUuid("Atewa West"), name: "Atewa West", code: "E2501" },
  { id: createConstituencyUuid("Ayensuano"), name: "Ayensuano", code: "E1201" },
  { id: createConstituencyUuid("Birim Central"), name: "Birim Central", code: "E3301" },
  { id: createConstituencyUuid("Birim North"), name: "Birim North", code: "E3201" },
  { id: createConstituencyUuid("Birim South"), name: "Birim South", code: "E3001" },
  { id: createConstituencyUuid("Denkyembour"), name: "Denkyembour", code: "E3101" },
  { id: createConstituencyUuid("East Akim"), name: "East Akim", code: "E1401" },
  { id: createConstituencyUuid("Fanteakwa North"), name: "Fanteakwa North", code: "E2701" },
  { id: createConstituencyUuid("Fanteakwa South"), name: "Fanteakwa South", code: "E2801" },
  { id: createConstituencyUuid("Kade"), name: "Kade", code: "E2001" },
  { id: createConstituencyUuid("Koforidua Central"), name: "Koforidua Central", code: "E0601" },
  { id: createConstituencyUuid("Koforidua Eastern"), name: "Koforidua Eastern", code: "E0501" },
  { id: createConstituencyUuid("Kwaebibirem"), name: "Kwaebibirem", code: "E1901" },
  { id: createConstituencyUuid("Lower Manya Krobo"), name: "Lower Manya Krobo", code: "E0201" },
  { id: createConstituencyUuid("Manya Krobo"), name: "Manya Krobo", code: "E0401" },
  { id: createConstituencyUuid("Mpraeso"), name: "Mpraeso", code: "E3001" },
  { id: createConstituencyUuid("New Juaben North"), name: "New Juaben North", code: "E0601" },
  { id: createConstituencyUuid("New Juaben South"), name: "New Juaben South", code: "E0501" },
  { id: createConstituencyUuid("Nkawkaw"), name: "Nkawkaw", code: "E2901" },
  { id: createConstituencyUuid("Nsawam-Adoagyiri"), name: "Nsawam-Adoagyiri", code: "E1001" },
  { id: createConstituencyUuid("Okere"), name: "Okere", code: "E0801" },
  { id: createConstituencyUuid("Suhum"), name: "Suhum", code: "E1101" },
  { id: createConstituencyUuid("Upper Manya Krobo"), name: "Upper Manya Krobo", code: "E0301" },
  { id: createConstituencyUuid("Upper West Akim"), name: "Upper West Akim", code: "E1401" },
  { id: createConstituencyUuid("West Akim"), name: "West Akim", code: "E1301" },
  { id: createConstituencyUuid("Yilo Krobo"), name: "Yilo Krobo", code: "E0401" },
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
    password: "Tracker78$Admin",
    role: "administrator",
  },
];

export const DEMO_USERS = DEFAULT_DEMO_USERS;

const constituencyId = (name: string) =>
  EASTERN_REGION_CONSTITUENCIES.find((constituency) => constituency.name.toLowerCase() === name.toLowerCase())?.id ?? createConstituencyUuid(name);

const DEMO_RECORDS: DemoRecord[] = [
  {
    id: "record-1",
    full_name: "Akua Boateng",
    constituency_id: constituencyId("Akwatia"),
    constituency_name: "Akwatia",
    phone: "+233244123456",
    gender: "female",
    verification_status: "verified",
    admin_note: "Confirmed at ward office.",
    created_by: "admin-1",
    created_at: "2026-10-02T09:30:00.000Z",
    updated_at: "2026-10-02T09:30:00.000Z",
  },
  {
    id: "record-2",
    full_name: "Kwame Owusu",
    constituency_id: constituencyId("Abirem"),
    constituency_name: "Abirem",
    phone: "+233501234567",
    gender: "male",
    verification_status: "pending",
    admin_note: "Follow up for ID verification.",
    created_by: "admin-2",
    created_at: "2026-10-03T12:00:00.000Z",
    updated_at: "2026-10-05T08:00:00.000Z",
  },
  {
    id: "record-3",
    full_name: "Esi Danso",
    constituency_id: constituencyId("Koforidua Central"),
    constituency_name: "Koforidua Central",
    phone: "+233542345678",
    gender: "female",
    verification_status: "verified",
    admin_note: "Strong grassroots support.",
    created_by: "admin-1",
    created_at: "2026-10-04T08:15:00.000Z",
    updated_at: "2026-10-04T08:15:00.000Z",
  },
  {
    id: "record-4",
    full_name: "Yaw Addo",
    constituency_id: constituencyId("New Juaben South"),
    constituency_name: "New Juaben South",
    phone: "+233277890123",
    gender: "male",
    verification_status: "requires_correction",
    admin_note: "Phone number needs confirmation.",
    created_by: "admin-2",
    created_at: "2026-10-05T11:05:00.000Z",
    updated_at: "2026-10-06T09:40:00.000Z",
  },
  {
    id: "record-5",
    full_name: "Mabel Tetteh",
    constituency_id: constituencyId("Nsawam-Adoagyiri"),
    constituency_name: "Nsawam-Adoagyiri",
    phone: "+233246789012",
    gender: "female",
    verification_status: "pending",
    admin_note: "Awaiting volunteer confirmation.",
    created_by: "admin-1",
    created_at: "2026-10-07T16:20:00.000Z",
    updated_at: "2026-10-07T16:20:00.000Z",
  },
  {
    id: "record-6",
    full_name: "Naa Abeka",
    constituency_id: constituencyId("Akwatia"),
    constituency_name: "Akwatia",
    phone: "+233556677889",
    gender: "female",
    verification_status: "verified",
    admin_note: "Voter outreach group activated.",
    created_by: "admin-1",
    created_at: "2026-10-08T10:10:00.000Z",
    updated_at: "2026-10-08T10:10:00.000Z",
  },
  {
    id: "record-7",
    full_name: "Samuel Boadu",
    constituency_id: constituencyId("Abirem"),
    constituency_name: "Abirem",
    phone: "+233249876543",
    gender: "male",
    verification_status: "verified",
    admin_note: "Verified through volunteer call log.",
    created_by: "admin-2",
    created_at: "2026-10-09T07:30:00.000Z",
    updated_at: "2026-10-09T07:30:00.000Z",
  },
  {
    id: "record-8",
    full_name: "Felicia Aidoo",
    constituency_id: constituencyId("Koforidua Central"),
    constituency_name: "Koforidua Central",
    phone: "+233242938475",
    gender: "female",
    verification_status: "pending",
    admin_note: "Waiting for constituency update.",
    created_by: "admin-1",
    created_at: "2026-10-10T15:40:00.000Z",
    updated_at: "2026-10-11T09:10:00.000Z",
  },
  {
    id: "record-9",
    full_name: "Michael Kusi",
    constituency_id: constituencyId("New Juaben South"),
    constituency_name: "New Juaben South",
    phone: "+233207654321",
    gender: "male",
    verification_status: "verified",
    admin_note: "Confirmed at market outreach point.",
    created_by: "admin-1",
    created_at: "2026-10-11T14:15:00.000Z",
    updated_at: "2026-10-11T14:15:00.000Z",
  },
  {
    id: "record-10",
    full_name: "Efua Kwarteng",
    constituency_id: constituencyId("Nsawam-Adoagyiri"),
    constituency_name: "Nsawam-Adoagyiri",
    phone: "+233559988776",
    gender: "female",
    verification_status: "requires_correction",
    admin_note: "Name mismatch with forms.",
    created_by: "admin-2",
    created_at: "2026-10-12T18:20:00.000Z",
    updated_at: "2026-10-12T18:20:00.000Z",
  },
];

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

export function saveDemoSession(session: DemoSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_SESSION_KEY);
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
    const sanitized = parsed.map(sanitizeDemoRecord);
    if (JSON.stringify(sanitized) !== JSON.stringify(parsed)) {
      window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
export function saveDemoRecords(records: DemoRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(records));
}

export function getDashboardSummary(records: DemoRecord[]): DashboardSummary {
  const total = records.length;
  const verified = records.filter((record) => record.verification_status === "verified").length;
  const pending = records.filter((record) => record.verification_status === "pending").length;
  const correction = records.filter((record) => record.verification_status === "requires_correction").length;

  const byConstituency = EASTERN_REGION_CONSTITUENCIES.map((constituency) => ({
    name: constituency.name,
    count: records.filter((record) => record.constituency_name.toLowerCase() === constituency.name.toLowerCase()).length,
  }));

  const byStatus = [
    { status: "verified" as const, count: verified },
    { status: "pending" as const, count: pending },
    { status: "requires_correction" as const, count: correction },
  ];

  return {
    total,
    verified,
    pending,
    correction,
    byConstituency,
    byStatus,
    recentRecords: [...records].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
  };
}

export function getDemoUsers(): DemoUser[] {
  if (typeof window === "undefined") {
    return DEMO_USERS;
  }

  const raw = window.localStorage.getItem("election-demo-users");
  if (!raw) {
    window.localStorage.setItem("election-demo-users", JSON.stringify(DEMO_USERS));
    return DEMO_USERS;
  }

  try {
    const parsed = JSON.parse(raw) as DemoUser[];
    return parsed.length ? parsed : DEMO_USERS;
  } catch {
    return DEMO_USERS;
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
