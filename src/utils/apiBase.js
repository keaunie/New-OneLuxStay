import { API_BASE } from "../config/apiBase";

const FUNCTIONS_PATH = "/.netlify/functions";
const normalizeOrigin = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

export const apiBase = API_BASE
  ? `${normalizeOrigin(API_BASE)}${FUNCTIONS_PATH}`
  : FUNCTIONS_PATH;

export default apiBase;
