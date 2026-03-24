import { isSupabaseEnforced, parseEnvBoolean, shouldUseSupabaseProvider } from "./supabaseClient.js";
import { getSiteContentByKey } from "./supabaseService.js";

const DEFAULT_CONCIERGE_KEY =
  process.env.SUPABASE_SITE_CONTENT_CONCIERGE_KEY || "concierge_knowledge";

export const isSupabaseContentEnabled = () =>
  shouldUseSupabaseProvider("content") ||
  parseEnvBoolean(process.env.SUPABASE_USE_FOR_CONTENT, false);

export const readSiteContentValue = async ({ key, fallbackValue = null } = {}) => {
  if (!isSupabaseContentEnabled()) return fallbackValue;

  try {
    const row = await getSiteContentByKey(key);
    if (!row || row.value == null) return fallbackValue;
    return row.value;
  } catch (error) {
    if (isSupabaseEnforced()) {
      throw error;
    }
    console.warn("Supabase content lookup failed, falling back to local content", {
      key,
      message: error?.message || String(error),
    });
    return fallbackValue;
  }
};

export const getConciergeKnowledgeFromSupabase = async (fallbackValue) =>
  readSiteContentValue({ key: DEFAULT_CONCIERGE_KEY, fallbackValue });
