/**
 * seed-knowledge.js
 *
 * Admin-only endpoint that uploads all local knowledge (city attractions,
 * neighborhood highlights, guest reviews, AI documents) into the Supabase
 * documents + sections tables with OpenAI embeddings so Lucy can retrieve
 * them via RAG during conversations.
 *
 * POST /.netlify/functions/seed-knowledge
 * Header: x-seed-key: <SEED_SECRET_KEY env var>
 *
 * Optional body: { dryRun: true }  — builds docs without writing to Supabase
 * Optional body: { contentTypes: ["attractions","highlights","reviews","documents"] }
 */

import dotenv from "dotenv";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

dotenv.config();

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_DELAY_MS = 300;

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createEmbedding = async (apiKey, text) => {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: String(text || "").slice(0, 8000),
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Embedding failed (${response.status}): ${err.slice(0, 200)}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || !embedding.length) {
    throw new Error("Empty embedding response");
  }
  return embedding;
};

const toVectorLiteral = (embedding) => `[${embedding.join(",")}]`;

const upsertDocument = async ({ title, contentType, slug }) => {
  const rows = await supabaseRestRequest("documents", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { title, content_type: contentType, slug: slug || null },
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error(`Failed to upsert document: ${title}`);
  return Number(row.id);
};

const upsertSection = async ({ documentId, key, title, content, embedding }) => {
  await supabaseRestRequest("sections", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      document_id: documentId,
      slug: key || null,
      title,
      content,
      token_count: Math.ceil(content.length / 4),
      embedding: toVectorLiteral(embedding),
    },
  });
};

const buildAttractionDocs = async () => {
  const { CITY_ATTRACTIONS } = await import("../../src/data/cityAttractions.js");
  const docs = [];

  for (const [cityKey, cityData] of Object.entries(CITY_ATTRACTIONS)) {
    const cityName = cityData.cityName || cityKey;
    const sections = [];

    if (cityData.intro) {
      sections.push({
        key: `${cityKey}-intro`,
        title: `About ${cityName}`,
        content: `${cityData.tagline ? cityData.tagline + " " : ""}${cityData.intro}`,
      });
    }

    for (const category of cityData.categories || []) {
      const attractionLines = (category.attractions || []).map(
        (a) => `${a.name}${a.tag ? ` (${a.tag})` : ""}: ${a.description}${a.distance ? ` Location: ${a.distance}.` : ""}`,
      );

      if (attractionLines.length) {
        sections.push({
          key: `${cityKey}-${category.id}`,
          title: `${cityName} — ${category.label}`,
          content: [category.narrative || "", ...attractionLines].filter(Boolean).join("\n"),
        });
      }
    }

    if (sections.length) {
      docs.push({
        title: `${cityName} Attractions & Travel Guide`,
        contentType: "city_attractions",
        slug: `${cityKey}-attractions`,
        sections,
      });
    }
  }

  return docs;
};

const buildHighlightDocs = async () => {
  const { CITY_HIGHLIGHTS } = await import("../../src/data/cityHighlights.js");
  const docs = [];

  for (const [cityKey, cityData] of Object.entries(CITY_HIGHLIGHTS)) {
    const cityName = cityKey.charAt(0).toUpperCase() + cityKey.slice(1).replace(/-/g, " ");
    const sections = [];

    if (cityData.intro) {
      sections.push({
        key: `${cityKey}-highlights-intro`,
        title: `${cityName} Neighborhood Overview`,
        content: cityData.intro,
      });
    }

    for (const item of cityData.items || []) {
      sections.push({
        key: `${cityKey}-highlight-${item.title?.toLowerCase().replace(/\s+/g, "-")}`,
        title: item.title,
        content: `${item.title}${item.distance ? ` — ${item.distance} from the property` : ""}. ${item.desc}`,
      });
    }

    if (sections.length) {
      docs.push({
        title: `${cityName} Neighborhood Highlights`,
        contentType: "city_highlights",
        slug: `${cityKey}-highlights`,
        sections,
      });
    }
  }

  return docs;
};

const buildReviewDocs = async () => {
  const reviewFiles = [
    { file: "reviews-miami", property: "Miami", city: "Miami" },
    { file: "reviews-dodger", property: "Dodger Stadium Area", city: "Los Angeles" },
    { file: "reviews-hollywood", property: "Hollywood", city: "Los Angeles" },
    { file: "reviews-hwh", property: "Hollywood Hills", city: "Los Angeles" },
    { file: "reviews-redondo", property: "Redondo Beach", city: "Redondo Beach" },
  ];

  const docs = [];

  for (const { file, property, city } of reviewFiles) {
    let reviews;
    try {
      const mod = await import(`../../src/data/${file}.json`, { with: { type: "json" } });
      reviews = mod.default || mod;
    } catch {
      continue;
    }

    if (!Array.isArray(reviews) || !reviews.length) continue;

    const sections = reviews
      .filter((r) => r.quote && r.name)
      .map((r, i) => {
        const rating = r.rating ? `${r.rating}/5 stars. ` : "";
        const tripType = r.details?.find((d) => d.startsWith("Trip type:")) || "";
        return {
          key: `${file}-review-${i}`,
          title: `Guest review — ${r.name}${r.date ? ` (${r.date})` : ""}`,
          content: `${rating}${r.quote}${tripType ? " " + tripType + "." : ""} Property: ${property}, ${city}.`,
        };
      });

    const avgRating =
      reviews.filter((r) => r.rating).reduce((sum, r) => sum + r.rating, 0) /
      (reviews.filter((r) => r.rating).length || 1);

    sections.unshift({
      key: `${file}-summary`,
      title: `${property} Guest Review Summary`,
      content: `One Lux Stay ${property} in ${city} has an average guest rating of ${avgRating.toFixed(1)}/5 based on ${reviews.length} reviews. Guests consistently highlight the quality of the space, location, and service.`,
    });

    docs.push({
      title: `${property} Guest Reviews`,
      contentType: "guest_reviews",
      slug: `${file}-reviews`,
      sections,
    });
  }

  return docs;
};

const buildAiDocumentDocs = async () => {
  const { aiDocuments } = await import("../../src/data/aiDocuments.js");
  const docs = [];

  for (const doc of aiDocuments || []) {
    const sections = (doc.sections || []).map((s) => ({
      key: `${doc.slug}-${s.key}`,
      title: s.title,
      content: s.content,
    }));

    if (sections.length) {
      docs.push({
        title: doc.title,
        contentType: doc.contentType || "document",
        slug: doc.slug,
        sections,
      });
    }
  }

  return docs;
};

const buildPropertyFaqDoc = () => {
  const faqs = [
    {
      key: "early-checkin",
      title: "Early Check-In",
      content:
        "Standard check-in is 3:00 PM. Early check-in can often be arranged — guests should contact the One Lux Stay team in advance to request it, subject to availability. There is no guarantee but the team does their best.",
    },
    {
      key: "late-checkout",
      title: "Late Check-Out",
      content:
        "Standard check-out is 11:00 AM. Late check-out can sometimes be arranged by contacting the team ahead of time. Subject to availability, especially during peak periods.",
    },
    {
      key: "wifi",
      title: "WiFi & Internet",
      content:
        "All One Lux Stay properties include high-speed WiFi at no extra charge. The password is provided at check-in or in the welcome guide inside the unit.",
    },
    {
      key: "kitchen",
      title: "Kitchen & Cooking",
      content:
        "All units come with a fully-equipped kitchen including a refrigerator, stovetop, microwave, cookware, utensils, and basic essentials. Perfect for self-catering stays.",
    },
    {
      key: "parking",
      title: "Parking",
      content:
        "Parking availability varies by property and city. Some units have dedicated parking; others are near public parking. Contact the team before arrival to confirm parking options for your specific unit.",
    },
    {
      key: "pets",
      title: "Pet Policy",
      content:
        "Pet policies vary by property. Some One Lux Stay units are pet-friendly. Guests should contact the team before booking to confirm whether their specific unit accepts pets.",
    },
    {
      key: "smoking",
      title: "Smoking Policy",
      content:
        "All One Lux Stay properties are strictly non-smoking indoors. Please check with the team about designated outdoor smoking areas for your specific property.",
    },
    {
      key: "cancellation",
      title: "Cancellation Policy",
      content:
        "Cancellation policies vary by booking type and dates. The applicable policy is shown clearly during checkout before payment. Guests can also contact reservations@oneluxstay.com for clarification on their specific reservation.",
    },
    {
      key: "checkin-process",
      title: "Check-In Process",
      content:
        "After booking is confirmed, the One Lux Stay team will share detailed check-in instructions including access codes or key pickup information. The cardholder who made the booking must present valid ID at check-in.",
    },
    {
      key: "amenities",
      title: "Standard Amenities",
      content:
        "All One Lux Stay units include: high-speed WiFi, fully-equipped kitchen, hotel-quality linens and towels, air conditioning, smart TV, and a welcome guide. Specific amenities vary by property and are listed on each listing page.",
    },
    {
      key: "booking-process",
      title: "How to Book",
      content:
        "To book: choose a city or listing, select your dates and guest count, review the stay details and pricing, then complete checkout securely on the website. Payment is processed via Stripe. You will receive a confirmation email with your reservation details.",
    },
    {
      key: "contact",
      title: "Contact & Support",
      content:
        "Guests can reach the One Lux Stay team via WhatsApp (+1 618 881 2613 for US and Dubai, +32 460 25 4886 for Antwerp) or by email at reservations@oneluxstay.com. The team is responsive and available to help with bookings, requests, and questions.",
    },
    {
      key: "group-bookings",
      title: "Group & Extended Stays",
      content:
        "One Lux Stay accommodates groups and extended stays. Multi-bedroom units are available in several cities. Contact the team directly for group bookings, monthly stays, or corporate accommodation needs.",
    },
    {
      key: "pricing",
      title: "Pricing & Fees",
      content:
        "Nightly rates vary by property, city, season, and length of stay. All fees including cleaning fees are shown transparently during checkout before payment. A security deposit or damage hold may be required.",
    },
  ];

  return [
    {
      title: "One Lux Stay — Common Questions & Answers",
      contentType: "faq",
      slug: "property-faq",
      sections: faqs,
    },
  ];
};

const getAllDocs = async (contentTypes) => {
  const all = [];
  const run = (type, fn) => (!contentTypes || contentTypes.includes(type) ? fn() : []);

  const [attractions, highlights, reviews, aiDocs, faq] = await Promise.all([
    run("attractions", buildAttractionDocs),
    run("highlights", buildHighlightDocs),
    run("reviews", buildReviewDocs),
    run("documents", buildAiDocumentDocs),
    run("faq", buildPropertyFaqDoc),
  ]);

  all.push(...(attractions || []), ...(highlights || []), ...(reviews || []), ...(aiDocs || []), ...(faq || []));
  return all;
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const seedKey = getEnv("SEED_SECRET_KEY");
  const providedKey = event.headers?.["x-seed-key"] || "";
  if (!seedKey || providedKey !== seedKey) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const dryRun = body.dryRun === true;
  const contentTypes = Array.isArray(body.contentTypes) ? body.contentTypes : null;

  const log = [];
  let totalSections = 0;
  let errors = 0;

  try {
    const docs = await getAllDocs(contentTypes);
    log.push(`Built ${docs.length} documents with ${docs.reduce((n, d) => n + d.sections.length, 0)} sections total`);

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          dryRun: true,
          documents: docs.map((d) => ({
            title: d.title,
            contentType: d.contentType,
            sectionCount: d.sections.length,
          })),
          log,
        }),
      };
    }

    for (const doc of docs) {
      let documentId;
      try {
        documentId = await upsertDocument({
          title: doc.title,
          contentType: doc.contentType,
          slug: doc.slug,
        });
        log.push(`Document: "${doc.title}" → id ${documentId}`);
      } catch (err) {
        log.push(`ERROR upserting document "${doc.title}": ${err.message}`);
        errors++;
        continue;
      }

      for (const section of doc.sections) {
        try {
          const embedding = await createEmbedding(apiKey, `${section.title}\n${section.content}`);
          await upsertSection({
            documentId,
            key: section.key,
            title: section.title,
            content: section.content,
            embedding,
          });
          totalSections++;
          await sleep(BATCH_DELAY_MS);
        } catch (err) {
          log.push(`ERROR on section "${section.title}": ${err.message}`);
          errors++;
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        documentsProcessed: docs.length,
        sectionsUploaded: totalSections,
        errors,
        log,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, log }),
    };
  }
};