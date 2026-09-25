// Shared OpenRouter chat settings for the guest concierge (chat.js) and the
// admin/executive assistant (executive-ols-assistant.js), so both bots pick
// models the same way and a retired model id only has to be fixed here.

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_REFERER = "https://oneluxstay.com";

// OpenRouter retires free model ids without notice (google/gemma-2-9b-it:free
// and meta-llama/llama-3.1-8b-instruct:free both vanished), and an unknown id
// fails every call.
export const DEFAULT_CHAT_MODEL = "qwen/qwen3.8-27b:free";
// Tried in order by OpenRouter when the primary model is rate-limited or down.
export const FALLBACK_CHAT_MODELS = ["google/gemma-4-31b-it:free", "z-ai/glm-5.2:free"];

const readEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";

// OpenRouter ids are "vendor/model"; a bare OpenAI-style value such as
// "gpt-5-mini" left in an env var is ignored rather than sent.
export const resolveChatModel = (...envNames) => {
  for (const name of [...envNames, "OPENAI_CHAT_MODEL"]) {
    const configured = String(readEnv(name) || "").trim();
    if (configured.includes("/")) return configured;
  }
  return DEFAULT_CHAT_MODEL;
};

export const buildChatModelFields = (model) => ({
  model,
  models: [model, ...FALLBACK_CHAT_MODELS.filter((fallback) => fallback !== model)],
});
