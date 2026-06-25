import { createClient } from "@supabase/supabase-js";

const resolveValue = (...candidates) =>
  candidates
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";

const supabaseUrl = resolveValue(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_PUBLIC_SUPABASE_URL,
);

const supabaseAnonKey = resolveValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
);

export const hasSupabasePresenceConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const getSupabasePresenceClient = (accessToken = "", { fetch: customFetch } = {}) => {
  if (!hasSupabasePresenceConfig) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      ...(typeof customFetch === "function" ? { fetch: customFetch } : {}),
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
};

export const getSupabasePresenceRestConfig = () => ({
  supabaseUrl,
  supabaseAnonKey,
});

