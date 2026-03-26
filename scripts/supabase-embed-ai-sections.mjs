import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
).trim();
const openAiApiKey = String(process.env.OPENAI_API_KEY || "").trim();
const embeddingModel = String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim();
const sectionsTable = String(process.env.SUPABASE_AI_SECTIONS_TABLE || "sections").trim();
const reembedAll = /^(1|true|yes|on)$/i.test(String(process.env.AI_REEMBED_ALL || "").trim());
const pageSize = Math.max(1, Math.min(200, Number(process.env.AI_EMBED_PAGE_SIZE || 100) || 100));
const embedBatchSize = Math.max(1, Math.min(50, Number(process.env.AI_EMBED_BATCH_SIZE || 20) || 20));

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!openAiApiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const supabaseRequest = async (path, { method = "GET", body, prefer } = {}) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  return payload;
};

const openAiEmbedding = async (inputs = []) => {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs,
    }),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed (${response.status}): ${text}`);
  }

  const vectors = Array.isArray(payload?.data)
    ? payload.data
        .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
        .map((item) => item.embedding)
    : [];

  if (vectors.length !== inputs.length) {
    throw new Error("OpenAI embeddings response length mismatch");
  }

  return vectors;
};

const toVectorLiteral = (values = []) => `[${values.map((value) => Number(value) || 0).join(",")}]`;

const fetchAllSections = async () => {
  const rows = [];
  let offset = 0;

  while (true) {
    const query = new URLSearchParams({
      select: "id,content",
      order: "id.asc",
      limit: String(pageSize),
      offset: String(offset),
      ...(reembedAll ? {} : { embedding: "is.null" }),
    });

    const page = await supabaseRequest(`${sectionsTable}?${query.toString()}`);
    const list = Array.isArray(page) ? page : [];
    rows.push(...list);
    if (list.length < pageSize) break;
    offset += list.length;
  }

  return rows;
};

const sections = await fetchAllSections();
if (!sections.length) {
  console.log("No sections found for embedding.");
  process.exit(0);
}

let updated = 0;
for (let i = 0; i < sections.length; i += embedBatchSize) {
  const batch = sections.slice(i, i + embedBatchSize);
  const inputs = batch.map((row) => String(row.content || "").trim());
  const embeddings = await openAiEmbedding(inputs);

  for (let j = 0; j < batch.length; j += 1) {
    const row = batch[j];
    const embedding = embeddings[j];
    if (!Array.isArray(embedding) || !embedding.length) continue;

    await supabaseRequest(`${sectionsTable}?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      body: {
        embedding: toVectorLiteral(embedding),
      },
      prefer: "return=minimal",
    });

    updated += 1;
  }

  console.log(`Embedded ${Math.min(i + embedBatchSize, sections.length)} / ${sections.length} sections`);
}

console.log(`Done. Updated ${updated} section embeddings using model ${embeddingModel}.`);
