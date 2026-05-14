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

let cachedClient = null;

export const hasSupabasePresenceConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const getSupabasePresenceClient = () => {
  if (!hasSupabasePresenceConfig) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return cachedClient;
};

export const getSupabasePresenceRestConfig = () => ({
  supabaseUrl,
  supabaseAnonKey,
});

