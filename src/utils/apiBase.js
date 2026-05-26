import { API_BASE } from "../config/apiBase";

const FUNCTIONS_PATH = "/.netlify/functions";
const normalizeOrigin = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const stripIndexSuffix = (value = "") => String(value || "").replace(/\/index$/, "");

const normalizedBase = stripIndexSuffix(normalizeOrigin(API_BASE));

export const apiBase = (() => {
  if (!normalizedBase) return FUNCTIONS_PATH;
  if (normalizedBase.includes(FUNCTIONS_PATH)) return normalizedBase;
  return `${normalizedBase}${FUNCTIONS_PATH}`;
})();

export default apiBase;
