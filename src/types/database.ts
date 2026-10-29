import type { AppRole } from "@/lib/roles";

export type VerificationStatus = "verified" | "pending" | "requires_correction";

export type Gender = "female" | "male" | "other" | "prefer_not_to_say";

export type Constituency = {
  id: string;
  name: string;
  code: string;
  region: string;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
};

export type AdministrativeRecord = {
  id: string;
  internal_code: string;
  full_name: string;
  constituency_id: string;
  phone_e164: string | null;
  gender: Gender | null;
  verification_status: VerificationStatus;
  admin_note: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  constituencies?: Pick<Constituency, "id" | "name" | "code"> | null;
};

export type VerificationHistory = {
  id: string;
  record_id: string;
  from_status: VerificationStatus | null;
  to_status: VerificationStatus;
  reason: string;
  changed_by: string;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DashboardMetrics = {
  total_records: number;
  verified_records: number;
  pending_records: number;
  correction_records: number;
  constituencies_with_data: number;
  completeness_percent: number;
  created_over_time: { date: string; count: number }[];
  verification_distribution: { status: VerificationStatus; count: number }[];
  completeness_by_constituency: {
    constituency_id: string;
    constituency_name: string;
    total: number;
    complete: number;
    completeness_percent: number;
  }[];
  activity_over_time: { date: string; count: number }[];
};

export type DuplicateMatch = {
  id: string;
  internal_code: string;
  full_name: string;
  constituency_name: string;
  match_reason: "phone" | "name_constituency";
};
