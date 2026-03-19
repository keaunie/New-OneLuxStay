import dotenv from "dotenv";

let loaded = false;

export const ensureLocalEnv = () => {
  if (loaded) return;
  loaded = true;

  try {
    dotenv.config();
  } catch {
    // Netlify production provides env vars directly; local .env loading is best-effort.
  }
};
