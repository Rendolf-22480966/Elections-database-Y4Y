export function getSupabasePublicEnv() {
  const authEnabled = process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === "true";
  const dataSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_SUPABASE_DATA_SYNC === "true";

  if (!authEnabled && !dataSyncEnabled) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (url.includes("YOUR-PROJECT-REF") || anonKey.includes("your-anon")) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseAuthEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === "true";
}

export function isSupabaseConfigured() {
  return getSupabasePublicEnv() !== null;
}
