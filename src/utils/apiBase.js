const configuredApiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions";

const isLocalHost =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || "");

const rawApiBase = isLocalHost ? "/.netlify/functions" : configuredApiBase;

export const apiBase = rawApiBase.replace(/\/index\/?$/, "");
export default apiBase;

