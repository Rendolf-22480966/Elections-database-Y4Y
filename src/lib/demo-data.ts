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

export const EASTERN_REGION_CONSTITUENCIES: Array<{ id: string; name: string; code: string }> = [
  { id: "constituency_01", name: "Abirem", code: "ABR-01" },
  { id: "constituency_02", name: "Abuakwa North", code: "ABN-02" },
  { id: "constituency_03", name: "Abuakwa South", code: "ABS-03" },
  { id: "constituency_04", name: "Achiase", code: "ACH-04" },
  { id: "constituency_05", name: "Akwatia", code: "AKW-05" },
  { id: "constituency_06", name: "Asene-Manso-Akroso", code: "AMA-06" },
  { id: "constituency_07", name: "Atewa East", code: "ATE-07" },
  { id: "constituency_08", name: "Atewa West", code: "ATW-08" },
  { id: "constituency_09", name: "Ayensuano", code: "AYE-09" },
  { id: "constituency_10", name: "Birim Central", code: "BIC-10" },
  { id: "constituency_11", name: "Birim North", code: "BIN-11" },
  { id: "constituency_12", name: "Birim South", code: "BIS-12" },
  { id: "constituency_13", name: "Denkyembour", code: "DEN-13" },
  { id: "constituency_14", name: "East Akim", code: "EAK-14" },
  { id: "constituency_15", name: "Fanteakwa North", code: "FAN-15" },
  { id: "constituency_16", name: "Fanteakwa South", code: "FAS-16" },
  { id: "constituency_17", name: "Kade", code: "KAD-17" },
  { id: "constituency_18", name: "Koforidua Central", code: "KFC-18" },
  { id: "constituency_19", name: "Koforidua Eastern", code: "KFE-19" },
  { id: "constituency_20", name: "Kwaebibirem", code: "KWA-20" },
  { id: "constituency_21", name: "Lower Manya Krobo", code: "LMK-21" },
  { id: "constituency_22", name: "Manya Krobo", code: "MKR-22" },
  { id: "constituency_23", name: "Mpraeso", code: "MPR-23" },
  { id: "constituency_24", name: "New Juaben North", code: "NJN-24" },
  { id: "constituency_25", name: "New Juaben South", code: "NJS-25" },
  { id: "constituency_26", name: "Nkawkaw", code: "NKW-26" },
  { id: "constituency_27", name: "Nsawam-Adoagyiri", code: "NSA-27" },
  { id: "constituency_28", name: "Okere", code: "OKE-28" },
  { id: "constituency_29", name: "Suhum", code: "SUH-29" },
  { id: "constituency_30", name: "Upper Manya Krobo", code: "UMK-30" },
  { id: "constituency_31", name: "Upper West Akim", code: "UWA-31" },
  { id: "constituency_32", name: "West Akim", code: "WAK-32" },
  { id: "constituency_33", name: "Yilo Krobo", code: "YIL-33" },
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

const DEMO_RECORDS: DemoRecord[] = [
  {
    id: "record-1",
    full_name: "Akua Boateng",
    constituency_id: "constituency_1",
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
    constituency_id: "constituency_2",
    constituency_name: "Abiribi",
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
    constituency_id: "constituency_3",
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
    constituency_id: "constituency_4",
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
    constituency_id: "constituency_5",
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
    constituency_id: "constituency_1",
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
    constituency_id: "constituency_2",
    constituency_name: "Abiribi",
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
    constituency_id: "constituency_3",
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
    constituency_id: "constituency_4",
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
    constituency_id: "constituency_5",
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
    return JSON.parse(raw) as DemoRecord[];
  } catch {
    return DEMO_RECORDS;
  }
}

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
