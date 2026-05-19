import { API_BASE } from "../config/domains";

const normalizeOrigin = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

export const PUBLIC_WEBSITE_URL = normalizeOrigin(
  import.meta.env.VITE_PUBLIC_SITE ||
    import.meta.env.VITE_PUBLIC_WEBSITE_URL ||
    "https://oneluxstay.com",
);

// Static assets always served from the stable Netlify domain.
export const ASSET_BASE_URL = "https://oneluxstayprop.netlify.app";

// All backend/function requests always target the deployed Netlify site.
export const INTERNAL_API_BASE = `${API_BASE}/.netlify/functions`;
