const normalizeOrigin = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

export const PUBLIC_WEBSITE_URL = normalizeOrigin(
  import.meta.env.VITE_PUBLIC_WEBSITE_URL || "https://oneluxstay.com",
);

const FUNCTIONS_PATH = "/.netlify/functions";

const buildInternalApiBase = () => {
  const configured = normalizeOrigin(import.meta.env.VITE_INTERNAL_API_BASE || "");
  if (configured) return configured.endsWith(FUNCTIONS_PATH) ? configured : `${configured}${FUNCTIONS_PATH}`;

  if (typeof window === "undefined") {
    // Browser-only constant; on the server (build time) just return relative.
    return FUNCTIONS_PATH;
  }

  const { hostname = "", origin = "", port = "" } = window.location || {};
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);

  if (isLocal) {
    // When using `netlify dev`, the app is served via `http://localhost:8888` and functions live under the same origin.
    // If the UI is opened directly on Vite's port, force the Netlify Dev origin.
    const localOrigin = port && port !== "8888" ? "http://localhost:8888" : origin;
    return `${normalizeOrigin(localOrigin)}${FUNCTIONS_PATH}`;
  }

  // Netlify deploy previews + production should resolve functions from the same origin.
  return `${normalizeOrigin(origin)}${FUNCTIONS_PATH}`;
};

export const INTERNAL_API_BASE = buildInternalApiBase();

