import crypto from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const boolean = (value) => value === true || ["true", "1", "yes", "on"].includes(clean(value).toLowerCase());
const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";

const getR2Config = () => {
  const accountId = clean(getEnv("CLOUDFLARE_ACCOUNT_ID") || getEnv("R2_ACCOUNT_ID"), 200);
  const endpoint = clean(getEnv("R2_ENDPOINT"), 500) || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const bucket = clean(getEnv("R2_BUCKET_NAME") || getEnv("R2_BUCKET"), 200);
  const accessKeyId = clean(getEnv("R2_ACCESS_KEY_ID"), 500);
  const secretAccessKey = clean(getEnv("R2_SECRET_ACCESS_KEY"), 500);
  const publicBaseUrl = clean(getEnv("R2_PUBLIC_BASE_URL") || getEnv("R2_PUBLIC_URL"), 1000).replace(/\/+$/, "");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new Error("R2 is not fully configured. Set R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL, and CLOUDFLARE_ACCOUNT_ID or R2_ENDPOINT.");
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
};

const createR2Client = (config) => new S3Client({
  region: "auto",
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

const PROPERTY_SELECT = [
  "*",
  "property_images(*)",
  "property_descriptions(*)",
  "property_amenities(*)",
  "property_tags(*)",
  "property_pricing(*)",
  "property_features(*)",
].join(",");

const loadProperties = () => supabaseRestRequest("properties", {
  query: { select: PROPERTY_SELECT, order: "city.asc,name.asc", limit: "1000" },
});

const saveProperty = async (payload = {}) => {
  const propertyId = clean(payload.id, 120);
  if (!propertyId) throw new Error("Property ID is required.");
  const property = {
    name: clean(payload.name, 240),
    property_code: clean(payload.property_code, 120) || null,
    address: clean(payload.address, 500) || null,
    city: clean(payload.city, 160) || null,
    country: clean(payload.country, 160) || null,
    room_type: clean(payload.room_type, 120) || null,
    bedrooms: numberOrNull(payload.bedrooms),
    bathrooms: numberOrNull(payload.bathrooms),
    accommodates: numberOrNull(payload.accommodates),
    size_sqm: numberOrNull(payload.size_sqm),
    has_balcony: boolean(payload.has_balcony),
    has_parking: boolean(payload.has_parking),
    has_wifi: boolean(payload.has_wifi),
    status: clean(payload.status, 40) || "active",
    updated_at: new Date().toISOString(),
  };
  await supabaseRestRequest("properties", {
    method: "PATCH",
    query: { id: `eq.${propertyId}` },
    body: property,
    prefer: "return=representation",
  });

  await supabaseRestRequest("property_descriptions", {
    method: "DELETE",
    query: { property_id: `eq.${propertyId}`, language: "eq.en" },
  });
  await supabaseRestRequest("property_descriptions", {
    method: "POST",
    body: [{
      property_id: propertyId,
      language: "en",
      title: clean(payload.title || payload.name, 240),
      description: clean(payload.description, 20000),
    }],
    prefer: "return=minimal",
  });

  for (const [table, column, values] of [
    ["property_amenities", "amenity", payload.amenities],
    ["property_tags", "tag", payload.tags],
  ]) {
    await supabaseRestRequest(table, { method: "DELETE", query: { property_id: `eq.${propertyId}` } });
    const normalized = [...new Set((Array.isArray(values) ? values : clean(values, 10000).split(","))
      .map((item) => clean(item, 200)).filter(Boolean))];
    if (normalized.length) {
      await supabaseRestRequest(table, {
        method: "POST",
        body: normalized.map((value) => ({ property_id: propertyId, [column]: value })),
        prefer: "return=minimal",
      });
    }
  }
  return { ok: true };
};

const signUpload = async (payload = {}) => {
  const propertyId = clean(payload.propertyId, 120);
  const fileName = clean(payload.fileName, 240);
  const contentType = clean(payload.contentType, 120).toLowerCase();
  const size = Number(payload.size || 0);
  if (!propertyId || !fileName) throw new Error("Property and file name are required.");
  if (!/^image\/(jpeg|png|webp|avif)$/.test(contentType)) throw new Error("Only JPEG, PNG, WebP, and AVIF images are supported.");
  if (!Number.isFinite(size) || size <= 0 || size > 15 * 1024 * 1024) throw new Error("Each image must be 15 MB or smaller.");
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[contentType];
  const safePropertyId = propertyId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const objectKey = `properties/${safePropertyId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const config = getR2Config();
  const uploadUrl = await getSignedUrl(createR2Client(config), new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }), { expiresIn: 300 });
  return { uploadUrl, objectKey, publicUrl: `${config.publicBaseUrl}/${objectKey}` };
};

const saveImage = async (payload = {}) => {
  const propertyId = clean(payload.propertyId, 120);
  const url = clean(payload.url, 2000);
  const objectKey = clean(payload.objectKey, 1000);
  if (!propertyId || !url || !objectKey) throw new Error("Uploaded image metadata is incomplete.");
  const existing = await supabaseRestRequest("property_images", {
    query: { select: "id", property_id: `eq.${propertyId}`, limit: "1" },
  });
  const rows = await supabaseRestRequest("property_images", {
    method: "POST",
    body: [{
      property_id: propertyId,
      url,
      object_key: objectKey,
      alt_text: clean(payload.altText, 300) || null,
      is_primary: !Array.isArray(existing) || existing.length === 0,
      sort_order: Math.max(0, Number(payload.sortOrder || 0) || 0),
    }],
    prefer: "return=representation",
  });
  return { image: rows?.[0] || null };
};

const updateImages = async (payload = {}) => {
  const propertyId = clean(payload.propertyId, 120);
  const images = Array.isArray(payload.images) ? payload.images : [];
  if (!propertyId) throw new Error("Property ID is required.");
  await Promise.all(images.map((image, index) => supabaseRestRequest("property_images", {
    method: "PATCH",
    query: { id: `eq.${clean(image.id, 120)}`, property_id: `eq.${propertyId}` },
    body: { sort_order: index, is_primary: index === 0, alt_text: clean(image.alt_text, 300) || null },
    prefer: "return=minimal",
  })));
  return { ok: true };
};

const deleteImage = async (payload = {}) => {
  const propertyId = clean(payload.propertyId, 120);
  const imageId = clean(payload.imageId, 120);
  const objectKey = clean(payload.objectKey, 1000);
  if (!propertyId || !imageId) throw new Error("Property and image IDs are required.");
  await supabaseRestRequest("property_images", {
    method: "DELETE",
    query: { id: `eq.${imageId}`, property_id: `eq.${propertyId}` },
  });
  if (objectKey) {
    const config = getR2Config();
    await createR2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  }
  return { ok: true };
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {}, body: "" };
  try {
    await verifyAdminsOlsAccess(event);
    if (event.httpMethod === "GET") return json(200, { properties: await loadProperties() });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    const body = JSON.parse(event.body || "{}");
    const action = clean(body.action, 80);
    if (action === "save-property") return json(200, await saveProperty(body.property));
    if (action === "sign-upload") return json(200, await signUpload(body));
    if (action === "save-image") return json(200, await saveImage(body));
    if (action === "update-images") return json(200, await updateImages(body));
    if (action === "delete-image") return json(200, await deleteImage(body));
    return json(400, { error: "Unknown action" });
  } catch (error) {
    console.error("[property-admin]", error);
    return json(Number(error?.statusCode) || 500, { error: clean(error?.message || "Property request failed", 800) });
  }
};
