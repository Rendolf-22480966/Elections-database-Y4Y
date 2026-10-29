export const ROLES = ["administrator", "campaign_manager", "executive_viewer"] as const;

export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: "Administrator",
  campaign_manager: "Campaign Manager",
  executive_viewer: "Executive Viewer",
};

export function isAppRole(value: string | null | undefined): value is AppRole {
  return ROLES.includes(value as AppRole);
}

export function canManageRecords(role: AppRole | null | undefined) {
  return role === "administrator" || role === "campaign_manager";
}

export function canViewPersonalContact(role: AppRole | null | undefined) {
  return role === "administrator" || role === "campaign_manager";
}

export function canManageUsers(role: AppRole | null | undefined) {
  return role === "administrator";
}

export function canViewAggregates(role: AppRole | null | undefined) {
  return isAppRole(role ?? "");
}
