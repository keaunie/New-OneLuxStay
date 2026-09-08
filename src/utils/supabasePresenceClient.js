import { createClient } from "@supabase/supabase-js";

const resolveValue = (...candidates) =>
  candidates
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";

// Falls back to the production project URL directly: it's not a secret (Supabase URLs are
// meant to be public) and keeping it out of Netlify's env vars avoids the per-function AWS
// Lambda 4KB environment size limit (see docs/netlify-lambda-env-limit-fix.md).
const supabaseUrl = resolveValue(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_PUBLIC_SUPABASE_URL,
  "https://mbnstabssoocoqtbdjgc.supabase.co",
);

// Supabase's publishable/anon key is explicitly designed to be public (it's shipped in the
// bundle regardless), so falling back to it directly here is safe.
const supabaseAnonKey = resolveValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
  "sb_publishable_pEhHlsWUT0ez2pkdYVNIOw_IY-IIYmV",
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

