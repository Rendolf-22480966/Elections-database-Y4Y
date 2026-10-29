const GH_LOCAL = /^0(2|5)\d{8}$/;
const GH_E164 = /^\+233(2|5)\d{8}$/;

export function normalizeGhanaPhone(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, "");
  if (!compact) return null;

  let candidate = compact;
  if (candidate.startsWith("00233")) {
    candidate = `+${candidate.slice(2)}`;
  } else if (candidate.startsWith("233") && candidate.length === 12) {
    candidate = `+${candidate}`;
  } else if (candidate.startsWith("0") && candidate.length === 10) {
    candidate = `+233${candidate.slice(1)}`;
  }

  if (GH_E164.test(candidate)) {
    return candidate;
  }

  return null;
}

export function isLikelyGhanaPhone(input: string) {
  const compact = input.replace(/[\s()-]/g, "");
  return GH_LOCAL.test(compact) || GH_E164.test(compact) || Boolean(normalizeGhanaPhone(input));
}

export function maskPhone(phone: string | null | undefined) {
  if (!phone) return "—";
  if (phone.length < 6) return "••••";
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}
