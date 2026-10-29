// Shared OpenRouter chat settings for the guest concierge (chat.js) and the
// admin/executive assistant (executive-ols-assistant.js), so both bots pick
// models the same way and a retired model id only has to be fixed here.

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_REFERER = "https://oneluxstay.com";

// OpenRouter retires free model ids without notice (google/gemma-2-9b-it:free,
// meta-llama/llama-3.1-8b-instruct:free, qwen/qwen3.8-27b:free and
// z-ai/glm-5.2:free all vanished), and an unknown id fails every call. The ids
// below are filtered against OpenRouter's live model list at request time (see
// loadLiveChatModels), so a retired one is skipped instead of breaking the bots.
export const DEFAULT_CHAT_MODEL = "google/gemma-4-31b-it:free";
// Tried in order by OpenRouter when the primary model is rate-limited or down.
export const FALLBACK_CHAT_MODELS = ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-lightning:free"];
// OpenRouter accepts at most this many ids in `models`.
const MAX_MODEL_CHOICES = 3;

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const LIVE_MODELS_TTL_MS = 60 * 60 * 1000;
const LIVE_MODELS_TIMEOUT_MS = 3000;

const readEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";

// Shared across warm invocations: { ids: Set<string>, fetchedAt: number }.
const liveModels = () => globalThis.__olsOpenRouterLiveModels || null;

// Refreshes the cached list of model ids OpenRouter currently serves. Best
// effort: on failure the previous list (or none) is kept and models go out
// unfiltered, which is no worse than before this check existed.
export const loadLiveChatModels = async () => {
  const cached = liveModels();
  if (cached && Date.now() - cached.fetchedAt < LIVE_MODELS_TTL_MS) return;
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(LIVE_MODELS_TIMEOUT_MS) });
    if (!response.ok) return;
    const payload = await response.json();
    const ids = new Set((Array.isArray(payload?.data) ? payload.data : []).map((model) => model?.id).filter(Boolean));
    if (ids.size) globalThis.__olsOpenRouterLiveModels = { ids, fetchedAt: Date.now() };
  } catch (error) {
    console.warn("[openRouterChat] could not load the live model list", error?.message || String(error));
  }
};

const isLiveModel = (id) => {
  const cached = liveModels();
  return !cached || cached.ids.has(id);
};

const liveDefaultModel = () =>
  [DEFAULT_CHAT_MODEL, ...FALLBACK_CHAT_MODELS].find(isLiveModel) || DEFAULT_CHAT_MODEL;

// OpenRouter ids are "vendor/model"; a bare OpenAI-style value such as
// "gpt-5-mini" left in an env var is ignored rather than sent, and so is a
// configured id OpenRouter no longer serves.
export const resolveChatModel = (...envNames) => {
  for (const name of [...envNames, "OPENAI_CHAT_MODEL"]) {
    const configured = String(readEnv(name) || "").trim();
    if (!configured.includes("/")) continue;
    if (isLiveModel(configured)) return configured;
    console.warn(`[openRouterChat] ${name}=${configured} is not an available OpenRouter model; using the default`);
  }
  return liveDefaultModel();
};

export const buildChatModelFields = (model) => {
  const choices = [...new Set([model, ...FALLBACK_CHAT_MODELS])].filter(isLiveModel).slice(0, MAX_MODEL_CHOICES);
  const models = choices.length ? choices : [liveDefaultModel()];
  return { model: models[0], models };
};
