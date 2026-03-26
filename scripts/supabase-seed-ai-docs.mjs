import dotenv from "dotenv";
import aiDocuments from "../src/data/aiDocuments.js";

dotenv.config();

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
).trim();
const documentsTable = String(process.env.SUPABASE_AI_DOCS_TABLE || "documents").trim();
const sectionsTable = String(process.env.SUPABASE_AI_SECTIONS_TABLE || "sections").trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const request = async (path, { method = "GET", body, prefer } = {}) => {
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

const escapeEq = (value) => String(value || "").replace(/,/g, "%2C");

const findDocument = async ({ title, contentType }) => {
  const query = new URLSearchParams({
    select: "id,title,content_type",
    title: `eq.${escapeEq(title)}`,
    content_type: `eq.${escapeEq(contentType)}`,
    limit: "1",
  });

  const rows = await request(`${documentsTable}?${query.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
};

const upsertDocument = async ({ title, contentType, lastUpdated }) => {
  const existing = await findDocument({ title, contentType });
  if (existing?.id) {
    await request(`${documentsTable}?id=eq.${existing.id}`, {
      method: "PATCH",
      body: {
        title,
        content_type: contentType,
        last_updated: lastUpdated || null,
      },
      prefer: "return=minimal",
    });
    return existing.id;
  }

  const inserted = await request(documentsTable, {
    method: "POST",
    body: [
      {
        title,
        content_type: contentType,
        last_updated: lastUpdated || null,
      },
    ],
    prefer: "return=representation",
  });

  return Array.isArray(inserted) && inserted[0]?.id ? inserted[0].id : null;
};

const findSection = async ({ documentId, title }) => {
  const query = new URLSearchParams({
    select: "id,document_id,title",
    document_id: `eq.${documentId}`,
    title: `eq.${escapeEq(title)}`,
    limit: "1",
  });

  const rows = await request(`${sectionsTable}?${query.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
};

const upsertSection = async ({ documentId, title, content }) => {
  const existing = await findSection({ documentId, title });
  if (existing?.id) {
    await request(`${sectionsTable}?id=eq.${existing.id}`, {
      method: "PATCH",
      body: { content },
      prefer: "return=minimal",
    });
    return existing.id;
  }

  const inserted = await request(sectionsTable, {
    method: "POST",
    body: [
      {
        document_id: documentId,
        title,
        content,
      },
    ],
    prefer: "return=representation",
  });

  return Array.isArray(inserted) && inserted[0]?.id ? inserted[0].id : null;
};

let documentCount = 0;
let sectionCount = 0;

for (const doc of aiDocuments) {
  const documentId = await upsertDocument({
    title: doc.title,
    contentType: doc.contentType,
    lastUpdated: doc.lastUpdated,
  });
  if (!documentId) continue;
  documentCount += 1;

  for (const section of doc.sections || []) {
    const sectionId = await upsertSection({
      documentId,
      title: section.title,
      content: section.content,
    });
    if (sectionId) sectionCount += 1;
  }
}

console.log(`Seeded/updated ${documentCount} documents and ${sectionCount} sections.`);
