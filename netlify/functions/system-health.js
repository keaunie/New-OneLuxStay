import dotenv from "dotenv";

dotenv.config();

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

export async function handler(event) {
  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const health = {
    openai: !!getEnv("OPENAI_API_KEY"),
    twilio: !!(getEnv("TWILIO_ACCOUNT_SID") && getEnv("TWILIO_AUTH_TOKEN")),
    supabase: !!(getEnv("SUPABASE_URL") && getEnv("SUPABASE_SERVICE_ROLE_KEY")),
    resend: !!getEnv("RESEND_API_KEY"),
    googleMaps: !!getEnv("GOOGLE_PLACES_API_KEY") || !!getEnv("VITE_GOOGLE_MAPS_API_KEY"),
    n8n: !!getEnv("N8N_WEBHOOK_URL"),
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(health),
  };
}
