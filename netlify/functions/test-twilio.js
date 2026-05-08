import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { action, to, message, sandbox } = JSON.parse(event.body || "{}");
  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const fromWhatsApp = getEnv("TWILIO_WHATSAPP_FROM");
  const fromSms = getEnv("TWILIO_SMS_FROM");

  if (sandbox) {
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        sid: `SANDBOX_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        message: `Sandbox ${action === "send_sms" ? "SMS" : "Call"} simulated successfully!` 
      })
    };
  }

  if (!accountSid || !authToken) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: "Twilio credentials not configured in .env" }) 
    };
  }

  const client = twilio(accountSid, authToken);

  try {
    if (action === "send_sms") {
      const result = await client.messages.create({
        body: message || "OneLuxStay: This is a test message from your System Configuration panel.",
        from: fromSms || fromWhatsApp,
        to: to
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, sid: result.sid })
      };
    }

    if (action === "make_call") {
      const twimlUrl = getEnv("TWILIO_VOICE_TWIML_URL");
      const fromVoice = getEnv("TWILIO_VOICE_FROM") || fromSms || fromWhatsApp;

      if (!twimlUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: "TWILIO_VOICE_TWIML_URL not set in .env" }) };
      }

      const call = await client.calls.create({
        url: twimlUrl,
        to: to,
        from: fromVoice
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, sid: call.sid, message: "Real call initiated!" })
      };
    }

    return { statusCode: 400, body: "Invalid action" };
  } catch (error) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
}
