import { ensureLocalEnv } from "./loadEnv.js";

ensureLocalEnv();

const readEnv = (...names) => {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
};

export const getGuestyOpenApiCredentials = () => ({
  clientId: readEnv("GUESTY_OPEN_API_CLIENT_ID", "GUESTY_CLIENT_ID"),
  clientSecret: readEnv("GUESTY_OPEN_API_CLIENT_SECRET", "GUESTY_CLIENT_SECRET"),
});
