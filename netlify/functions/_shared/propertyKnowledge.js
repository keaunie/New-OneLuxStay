import { supabaseRestRequest } from "./supabaseClient.js";

// property_knowledge is a small curated Q&A table (global, city and property
// scoped rows) shared by the guest concierge and the admin assistant. It's
// fetched whole, cached briefly, and ranked locally by keyword overlap.

const KNOWLEDGE_TABLE = "property_knowledge";
const CACHE_TTL_MS = 5 * 60 * 1000;

// Deliberately does NOT drop words like "policy"/"terms" — for this table
// those are exactly the words that identify the right row.
const STOP_WORDS = new Set([
  "and", "the", "for", "are", "can", "you", "what", "when", "where", "which", "how", "does", "with",
  "from", "that", "this", "your", "about", "have", "any", "there", "our", "tell", "please", "is",
  "do", "i", "my", "me", "we", "it", "at", "in", "on", "of", "to", "a", "an", "bring", "allowed",
  "get", "will", "would", "could", "should", "need", "want", "know",
]);

// Maps guest wording onto the vocabulary the table actually uses.
const SYNONYMS = {
  dog: "pet", dogs: "pet", cat: "pet", cats: "pet", animal: "pet", animals: "pet",
  refund: "cancel", refunds: "cancel", cancelling: "cancel", canceling: "cancel",
  internet: "wifi", wireless: "wifi",
  arrive: "checkin", arrival: "checkin", leave: "checkout", depart: "checkout",
  smoke: "smok", smoking: "smok", vape: "smok",
  car: "parking", garage: "parking", park: "parking",
  rules: "rule", payment: "deposit", pay: "deposit",
  // Common guest misspellings seen in chat logs.
  police: "polic", polices: "polic", policys: "polic",
};

// Hyphens and punctuation are removed on both sides so "check-in" and
// "checkin", "wi-fi" and "wifi" compare equal.
const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/[^a-z0-9\s]/g, " ");

const stem = (token) => (token.length > 4 ? token.replace(/(ies|es|s)$/, "") : token);

const splitWords = (value = "") =>
  normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

export const tokenizeKnowledgeQuery = (value = "") =>
  [...new Set(splitWords(value).map((token) => SYNONYMS[token] || stem(token)))].slice(0, 8);

const defaultNormalizeCity = (value = "") => {
  const lower = String(value || "").trim().toLowerCase();
  if (!lower) return "";
  if (lower.includes("antwerp")) return "antwerp";
  return lower;
};

let cachedRows = null;
let cachedAt = 0;

const loadKnowledgeRows = async () => {
  if (cachedRows && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRows;
  const rows = await supabaseRestRequest(KNOWLEDGE_TABLE, {
    query: {
      select: "scope,city,property_code,category,question,content",
      limit: 500,
    },
  });
  cachedRows = Array.isArray(rows) ? rows.filter((row) => row?.content) : [];
  cachedAt = Date.now();
  return cachedRows;
};

// Rows scoped to a different city than the one being asked about are dropped
// so an Antwerp question never picks up Dubai answers. Global rows always
// stay eligible.
export const retrievePropertyKnowledge = async ({
  queryText = "",
  city = "",
  propertyKey = "",
  limit = 4,
  normalizeCity = defaultNormalizeCity,
} = {}) => {
  const tokens = tokenizeKnowledgeQuery(queryText);
  if (!tokens.length) return [];
  // Unstemmed words get a small bonus so "your policies" prefers the row
  // literally asking "What are your policies?" over every row with "policy".
  const exactWords = splitWords(queryText);

  const rows = await loadKnowledgeRows();
  const targetCity = normalizeCity(city);
  const targetProperty = String(propertyKey || "").trim().toLowerCase();

  return rows
    .filter((row) => !targetCity || !row.city || normalizeCity(row.city) === targetCity)
    .map((row) => {
      const question = normalizeText(row.question);
      const category = normalizeText(row.category);
      const content = normalizeText(row.content);
      let score = 0;
      tokens.forEach((token) => {
        if (question.includes(token)) score += 4;
        if (category.includes(token)) score += 3;
        if (content.includes(token)) score += 1;
      });
      if (score > 0) {
        const questionWords = new Set(question.split(/\s+/));
        exactWords.forEach((word) => {
          if (questionWords.has(word)) score += 2;
        });
        // Rows scoped to the guest's city beat the generic global answer.
        if (targetCity && row.city) score += 2;
        if (targetProperty && String(row.property_code || "").toLowerCase() === targetProperty) score += 3;
      }
      return { row, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(6, Number(limit) || 4)))
    .map(({ row }) => row);
};

const clip = (value = "", maxLength = 900) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const buildPropertyKnowledgeText = (rows = []) =>
  rows
    .map((row) =>
      [
        `Scope: ${[row?.city, row?.property_code].filter(Boolean).join(" / ") || "All properties"}`,
        `Q: ${clip(row?.question, 240)}`,
        `A: ${clip(row?.content, 900)}`,
      ].join("\n"),
    )
    .join("\n\n");
