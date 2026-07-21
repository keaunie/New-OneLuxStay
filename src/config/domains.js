// Admin and internal function calls always use the canonical admin origin.
// Keeping this absolute also prevents a missing or literal `undefined`
// environment value from becoming a route relative to the current page.
export const API_BASE = "https://admin.oneluxstay.com";
export const PUBLIC_SITE_URL = "https://oneluxstay.com";
export const ASSET_BASE = "https://admin.oneluxstay.com";
