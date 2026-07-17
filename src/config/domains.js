const envApiBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : "";

export const API_BASE = String(envApiBase || "https://admin.oneluxstay.com").trim();
export const PUBLIC_SITE_URL = "https://oneluxstay.com";
export const ASSET_BASE = "https://admin.oneluxstay.com";
