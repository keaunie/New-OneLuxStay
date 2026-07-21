import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

const getCorsHeaders = (event = {}) => ({
  ...buildAiCorsHeaders(event),
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin, X-Requested-With, X-Admin-Key",
  "Cache-Control": "no-store",
});

const json = (statusCode, body, event) => ({
  statusCode,
  headers: getCorsHeaders(event),
  body: JSON.stringify(body),
});
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const nullable = (value, max) => clean(value, max) || null;
const integerOrNull = (value) => value === "" || value == null ? null : Math.trunc(Number(value));
const boolean = (value) => value === true || ["true", "1", "yes", "on"].includes(clean(value).toLowerCase());
const now = () => new Date().toISOString();
const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fail = (message, statusCode = 400, code = "validation") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
};
const requireUuid = (value, label = "Property ID") => {
  const id = clean(value, 80);
  if (!uuidPattern.test(id)) fail(`${label} must be a valid UUID.`);
  return id;
};
const getPropertyStorageSegment = async (propertyId) => {
  const id = requireUuid(propertyId);
  const rows = await supabaseRestRequest("properties", {
    query: { select: "property_code", id: `eq.${id}`, limit: 1 },
  });
  const propertyCode = clean(rows?.[0]?.property_code, 120);
  if (!propertyCode) fail("Set a OneLuxStay property code before uploading images.");
  const safeCode = propertyCode
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!safeCode) fail("The OneLuxStay property code cannot be used as an R2 folder name.");
  return safeCode;
};
const ensureFinite = (value, label, { integer = false, min = 0 } = {}) => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) {
    fail(`${label} must be ${integer ? "a whole number" : "a number"} of at least ${min}.`);
  }
  return parsed;
};
const getR2Config = () => {
  const accountId = clean(getEnv("CLOUDFLARE_ACCOUNT_ID") || getEnv("R2_ACCOUNT_ID"), 200);
  const endpoint = clean(getEnv("R2_ENDPOINT"), 500) || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const config = {
    endpoint,
    bucket: clean(getEnv("R2_BUCKET_NAME") || getEnv("R2_BUCKET"), 200),
    accessKeyId: clean(getEnv("R2_ACCESS_KEY_ID"), 500),
    secretAccessKey: clean(getEnv("R2_SECRET_ACCESS_KEY"), 500),
    publicBaseUrl: clean(getEnv("R2_PUBLIC_BASE_URL") || getEnv("R2_PUBLIC_URL"), 1000).replace(/\/+$/, ""),
  };
  if (Object.values(config).some((value) => !value)) fail("R2 uploads are not configured on the server.", 503, "configuration");
  return config;
};
const createR2Client = (config) => new S3Client({
  region: "auto", endpoint: config.endpoint,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
});

const LIST_SELECT = [
  "id", "property_code", "guesty_listing_id", "name", "address", "city", "country", "property_type",
  "room_type", "bedrooms", "bathrooms", "accommodates", "status", "website_status", "content_sync_mode",
  "source_system", "last_synced_at", "updated_at", "property_descriptions(title,language)",
  "property_images(id,is_primary,migration_status,public_url,url,original_source_url,sort_order)",
].join(",");
const PROPERTY_SELECT = [
  "id", "guesty_id", "guesty_listing_id", "name", "property_code", "address", "city", "country", "latitude",
  "longitude", "room_type", "bedrooms", "bathrooms", "accommodates", "size_sqm", "has_balcony", "has_parking",
  "has_wifi", "status", "created_at", "updated_at", "slug", "parent_property_id", "guesty_account_id",
  "guesty_listing_type", "guesty_parent_listing_id", "property_type", "beds", "bed_type", "min_nights", "max_nights",
  "timezone", "website_status", "content_sync_mode", "source_system", "source_updated_at", "last_synced_at",
  "property_descriptions(id,language,title,description,summary,space,access,interaction_with_guests,notes,neighborhood,transit,house_rules,source_system,source_updated_at,updated_at)",
  "property_amenities(id,amenity)", "property_tags(id,tag)", "property_features(id,key,value)",
  "property_beds(id,room_name,bed_type,quantity,source_text,sort_order,created_at,updated_at)",
  "property_pricing(id,base_price,currency,cleaning_fee,security_deposit,extra_guest_fee,created_at)",
].join(",");
const IMAGE_SELECT = "id,property_id,url,object_key,alt_text,is_primary,sort_order,created_at,guesty_image_id,original_source_url,thumbnail_source_url,thumbnail_object_key,public_url,caption,width,height,file_size_bytes,mime_type,migration_status,migration_error,migrated_at,updated_at";

const listProperties = async (params = {}) => {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(params.pageSize) || 25));
  const query = { select: LIST_SELECT, limit: pageSize, offset: (page - 1) * pageSize };
  query["property_images.is_primary"] = "eq.true";
  const search = clean(params.search, 200).replace(/[%,()]/g, " ");
  if (search) query.or = `(property_code.ilike.*${search}*,name.ilike.*${search}*,guesty_listing_id.ilike.*${search}*,city.ilike.*${search}*,address.ilike.*${search}*,country.ilike.*${search}*)`;
  for (const key of ["city", "country", "status", "website_status", "source_system", "room_type"]) {
    if (clean(params[key], 160)) query[key] = `eq.${clean(params[key], 160)}`;
  }
  const sortMap = { name: "name", property_code: "property_code", location: "city", updated_at: "updated_at", last_synced_at: "last_synced_at" };
  const sort = sortMap[params.sort] || "updated_at";
  query.order = `${sort}.${params.direction === "asc" ? "asc" : "desc"}.nullslast`;
  const rows = await supabaseRestRequest("properties", { query, prefer: "count=exact", includeResponse: true });
  const data = rows?.data || rows;
  const count = Number(rows?.count ?? rows?.total ?? data?.length ?? 0);
  return { properties: Array.isArray(data) ? data : [], page, pageSize, count };
};

const getProperty = async (propertyId) => {
  const id = requireUuid(propertyId);
  const rows = await supabaseRestRequest("properties", { query: { select: PROPERTY_SELECT, id: `eq.${id}`, limit: 1 } });
  if (!rows?.[0]) fail("Property not found.", 404, "not_found");
  const property = rows[0];
  const related = await Promise.allSettled([
    supabaseRestRequest("property_images", { query: { select: IMAGE_SELECT, property_id: `eq.${id}`, order: "sort_order.asc", limit: 100 } }),
    supabaseRestRequest("property_source_snapshots", { query: { select: "id,property_id,provider,external_listing_id,payload_hash,captured_at", property_id: `eq.${id}`, order: "captured_at.desc", limit: 25 } }),
    supabaseRestRequest("listings", { query: { select: "id,property_id,title,active,listed,pms_active,last_synced_at,updated_at", property_id: `eq.${id}`, limit: 25 } }),
  ]);
  property.property_images = related[0].status === "fulfilled" ? related[0].value : [];
  property.property_source_snapshots = related[1].status === "fulfilled" ? related[1].value : [];
  property.listings = related[2].status === "fulfilled" ? related[2].value : [];
  property.partialErrors = related.map((result, index) => result.status === "rejected" ? ["images", "source history", "listing bridge"][index] : null).filter(Boolean);
  return { property };
};

const PROPERTY_FIELDS = {
  name: [240], property_code: [120], guesty_listing_id: [200], address: [500], city: [160], country: [160],
  room_type: [120], status: [40], slug: [240], parent_property_id: [80], guesty_listing_type: [120],
  property_type: [120], bed_type: [120], timezone: [120], website_status: [40], content_sync_mode: [40], source_system: [80],
};
const buildProperty = (payload = {}, { creating = false } = {}) => {
  const output = {};
  for (const [key, [max]] of Object.entries(PROPERTY_FIELDS)) if (Object.hasOwn(payload, key)) output[key] = nullable(payload[key], max);
  for (const key of ["latitude", "longitude", "bedrooms", "bathrooms", "size_sqm"]) if (Object.hasOwn(payload, key)) output[key] = ensureFinite(payload[key], key.replaceAll("_", " "), { min: key === "latitude" ? -90 : key === "longitude" ? -180 : 0 });
  for (const key of ["accommodates", "beds", "min_nights", "max_nights"]) if (Object.hasOwn(payload, key)) output[key] = ensureFinite(payload[key], key.replaceAll("_", " "), { integer: true, min: key === "accommodates" || key === "min_nights" ? 1 : 0 });
  for (const key of ["has_balcony", "has_parking", "has_wifi"]) if (Object.hasOwn(payload, key)) output[key] = boolean(payload[key]);
  if (!clean(output.name ?? payload.name, 240)) fail("Property name is required.");
  if (output.max_nights != null && output.min_nights != null && output.max_nights < output.min_nights) fail("Maximum nights cannot be less than minimum nights.");
  if (payload.parent_property_id && payload.id && payload.parent_property_id === payload.id) fail("A property cannot be its own parent.");
  if (creating) output.created_at = now();
  output.updated_at = now();
  return output;
};
const createProperty = async (payload) => {
  const rows = await supabaseRestRequest("properties", { method: "POST", body: [buildProperty(payload, { creating: true })], prefer: "return=representation" });
  return { property: rows?.[0] };
};
const updateProperty = async (propertyId, payload) => {
  const id = requireUuid(propertyId);
  const rows = await supabaseRestRequest("properties", { method: "PATCH", query: { id: `eq.${id}` }, body: buildProperty({ ...payload, id }), prefer: "return=representation" });
  if (!rows?.[0]) fail("Property not found.", 404, "not_found");
  return { property: rows[0] };
};

const updateDescription = async (propertyId, language, payload = {}) => {
  const id = requireUuid(propertyId); const lang = clean(language || "en", 20).toLowerCase();
  const fields = ["title", "description", "summary", "space", "access", "interaction_with_guests", "notes", "neighborhood", "transit", "house_rules"];
  const body = Object.fromEntries(fields.map((key) => [key, nullable(payload[key], key === "title" ? 300 : 30000)]));
  if (!fields.some((key) => body[key])) fail("Enter description content before saving.");
  const existing = await supabaseRestRequest("property_descriptions", { query: { select: "id", property_id: `eq.${id}`, language: `eq.${lang}`, limit: 1 } });
  body.updated_at = now();
  const rows = existing?.[0]
    ? await supabaseRestRequest("property_descriptions", { method: "PATCH", query: { id: `eq.${existing[0].id}` }, body, prefer: "return=representation" })
    : await supabaseRestRequest("property_descriptions", { method: "POST", body: [{ property_id: id, language: lang, source_system: "oneluxstay_admin", ...body }], prefer: "return=representation" });
  return { description: rows?.[0] };
};

const addTextValue = async (table, column, propertyId, value) => {
  const id = requireUuid(propertyId); const normalized = clean(value, 200);
  if (!normalized) fail(`${column} is required.`);
  const existing = await supabaseRestRequest(table, { query: { select: `id,${column}`, property_id: `eq.${id}`, limit: 1000 } });
  if (existing.some((row) => clean(row[column]).toLowerCase() === normalized.toLowerCase())) fail(`That ${column} already exists.`, 409, "duplicate");
  const rows = await supabaseRestRequest(table, { method: "POST", body: [{ property_id: id, [column]: normalized }], prefer: "return=representation" });
  return { item: rows?.[0] };
};
const removeRelated = async (table, propertyId, itemId) => {
  const id = requireUuid(propertyId); const rowId = requireUuid(itemId, "Item ID");
  await supabaseRestRequest(table, { method: "DELETE", query: { id: `eq.${rowId}`, property_id: `eq.${id}` } });
  return { ok: true };
};
const replaceBeds = async (propertyId, beds = []) => {
  const id = requireUuid(propertyId);
  const normalized = beds.map((bed, index) => ({
    property_id: id, room_name: nullable(bed.room_name, 160), bed_type: clean(bed.bed_type, 120),
    quantity: ensureFinite(bed.quantity, "Bed quantity", { integer: true, min: 1 }), source_text: nullable(bed.source_text, 500), sort_order: index, updated_at: now(),
  }));
  if (normalized.some((bed) => !bed.bed_type)) fail("Every bed row requires a bed type.");
  await supabaseRestRequest("property_beds", { method: "DELETE", query: { property_id: `eq.${id}` } });
  if (normalized.length) await supabaseRestRequest("property_beds", { method: "POST", body: normalized, prefer: "return=minimal" });
  return { beds: normalized };
};
const updatePricing = async (propertyId, payload = {}) => {
  const id = requireUuid(propertyId); const currency = clean(payload.currency || "USD", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail("Currency must be a three-letter code.");
  const body = { currency };
  for (const key of ["base_price", "cleaning_fee", "security_deposit", "extra_guest_fee"]) body[key] = ensureFinite(payload[key], key.replaceAll("_", " "), { min: 0 });
  const existing = await supabaseRestRequest("property_pricing", { query: { select: "id", property_id: `eq.${id}`, order: "created_at.desc", limit: 1 } });
  const rows = existing?.[0]
    ? await supabaseRestRequest("property_pricing", { method: "PATCH", query: { id: `eq.${existing[0].id}` }, body, prefer: "return=representation" })
    : await supabaseRestRequest("property_pricing", { method: "POST", body: [{ property_id: id, ...body }], prefer: "return=representation" });
  return { pricing: rows?.[0] };
};

const signUpload = async (payload = {}) => {
  const propertyId = requireUuid(payload.propertyId); const fileName = clean(payload.fileName, 240);
  const contentType = clean(payload.contentType, 120).toLowerCase(); const size = Number(payload.size || 0);
  if (!fileName) fail("File name is required.");
  if (!/^image\/(jpeg|png|webp|avif)$/.test(contentType)) fail("Only JPEG, PNG, WebP, and AVIF images are supported.");
  if (!Number.isFinite(size) || size <= 0 || size > 15 * 1024 * 1024) fail("Each image must be 15 MB or smaller.");
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[contentType];
  const propertyStorageSegment = await getPropertyStorageSegment(propertyId);
  const objectKey = `properties/${propertyStorageSegment}/${Date.now()}-${crypto.randomUUID()}.${extension}`; const config = getR2Config();
  const uploadUrl = await getSignedUrl(createR2Client(config), new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }), { expiresIn: 300 });
  return { uploadUrl, objectKey, publicUrl: `${config.publicBaseUrl}/${objectKey}` };
};
const addImage = async (propertyId, payload = {}) => {
  const id = requireUuid(propertyId); const url = clean(payload.publicUrl || payload.url, 2000);
  if (!url) fail("A valid image URL is required.");
  try { new URL(url); } catch { fail("A valid image URL is required."); }
  const existing = await supabaseRestRequest("property_images", { query: { select: "id", property_id: `eq.${id}`, limit: 1 } });
  const rows = await supabaseRestRequest("property_images", { method: "POST", body: [{ property_id: id, url, public_url: nullable(payload.publicUrl, 2000), object_key: nullable(payload.objectKey, 1000), original_source_url: nullable(payload.originalSourceUrl, 2000), alt_text: nullable(payload.altText, 300), caption: nullable(payload.caption, 500), mime_type: nullable(payload.mimeType, 120), is_primary: !existing?.length, sort_order: Math.max(0, integerOrNull(payload.sortOrder) || 0), migration_status: payload.objectKey ? "verified" : "pending", migrated_at: payload.objectKey ? now() : null, updated_at: now() }], prefer: "return=representation" });
  return { image: rows?.[0] };
};
const migrateGuestyImage = async (propertyId, requestedImageId = "") => {
  const id = requireUuid(propertyId);
  const propertyStorageSegment = await getPropertyStorageSegment(id);
  const requestedId = requestedImageId ? requireUuid(requestedImageId, "Image ID") : "";
  const candidates = await supabaseRestRequest("property_images", {
    query: {
      select: "id,url,original_source_url,migration_status",
      property_id: `eq.${id}`,
      migration_status: "in.(pending,failed)",
      ...(requestedId ? { id: `eq.${requestedId}` } : {}),
      order: "sort_order.asc",
      limit: 1,
    },
  });
  const image = candidates?.[0];
  if (!image) return { processed: 0, verified: 0, failed: 0, image: null };

  const imageId = requireUuid(image.id, "Image ID");
  const sourceUrl = clean(image.original_source_url || image.url, 2000);
  await supabaseRestRequest("property_images", {
    method: "PATCH",
    query: { id: `eq.${imageId}`, property_id: `eq.${id}` },
    body: { migration_status: "copying", migration_error: null, updated_at: now() },
    prefer: "return=minimal",
  });

  try {
    let source;
    try { source = new URL(sourceUrl); } catch { fail("The Guesty source URL is invalid."); }
    if (source.protocol !== "https:" || source.hostname.toLowerCase() !== "assets.guesty.com") {
      fail("Only HTTPS images from assets.guesty.com can be migrated.");
    }

    const response = await fetch(source, {
      headers: { Accept: "image/*", "User-Agent": "OneLuxStay-R2-Migrator/1.0" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!response.ok) fail(`Guesty image download failed (${response.status}).`);
    const mimeType = clean(response.headers.get("content-type"), 120).split(";")[0].toLowerCase();
    if (!/^image\/(jpeg|png|webp|avif)$/.test(mimeType)) fail(`Guesty returned an unsupported content type (${mimeType || "unknown"}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) fail("Guesty returned an empty image.");
    if (bytes.length > 25 * 1024 * 1024) fail("The Guesty image exceeds the 25 MB migration limit.");

    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[mimeType];
    const objectKey = `properties/${propertyStorageSegment}/${imageId}.${extension}`;
    const config = getR2Config();
    await createR2Client(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { source: "guesty", "property-id": id, "image-id": imageId },
    }));
    const publicUrl = `${config.publicBaseUrl}/${objectKey}`;
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const updated = await supabaseRestRequest("property_images", {
      method: "PATCH",
      query: { id: `eq.${imageId}`, property_id: `eq.${id}` },
      body: { object_key: objectKey, public_url: publicUrl, mime_type: mimeType, file_size_bytes: bytes.length, checksum_sha256: checksum, migration_status: "verified", migration_error: null, migrated_at: now(), updated_at: now() },
      prefer: "return=representation",
    });
    return { processed: 1, verified: 1, failed: 0, image: updated?.[0] || { id: imageId, migration_status: "verified", public_url: publicUrl } };
  } catch (error) {
    const message = clean(error?.name === "TimeoutError" ? "Guesty image download timed out." : error?.message || "Image migration failed.", 800);
    await supabaseRestRequest("property_images", {
      method: "PATCH",
      query: { id: `eq.${imageId}`, property_id: `eq.${id}` },
      body: { migration_status: "failed", migration_error: message, updated_at: now() },
      prefer: "return=minimal",
    });
    return { processed: 1, verified: 0, failed: 1, image: { id: imageId, migration_status: "failed", migration_error: message } };
  }
};
const updateImage = async (propertyId, imageId, payload = {}) => {
  const id = requireUuid(propertyId); const rowId = requireUuid(imageId, "Image ID"); const body = {};
  for (const key of ["alt_text", "caption"]) if (Object.hasOwn(payload, key)) body[key] = nullable(payload[key], key === "caption" ? 500 : 300);
  if (Object.hasOwn(payload, "sort_order")) body.sort_order = Math.max(0, integerOrNull(payload.sort_order) || 0);
  body.updated_at = now();
  const rows = await supabaseRestRequest("property_images", { method: "PATCH", query: { id: `eq.${rowId}`, property_id: `eq.${id}` }, body, prefer: "return=representation" });
  return { image: rows?.[0] };
};
const reorderImages = async (propertyId, orderedIds = []) => {
  const id = requireUuid(propertyId); const ids = orderedIds.map((item) => requireUuid(item, "Image ID"));
  await Promise.all(ids.map((imageId, index) => supabaseRestRequest("property_images", { method: "PATCH", query: { id: `eq.${imageId}`, property_id: `eq.${id}` }, body: { sort_order: index, updated_at: now() }, prefer: "return=minimal" })));
  return { ok: true };
};
const setPrimaryImage = async (propertyId, imageId) => {
  const id = requireUuid(propertyId); const rowId = requireUuid(imageId, "Image ID");
  const selected = await supabaseRestRequest("property_images", { query: { select: "id", id: `eq.${rowId}`, property_id: `eq.${id}`, limit: 1 } });
  if (!selected?.length) fail("Image not found.", 404, "not_found");
  await supabaseRestRequest("property_images", { method: "PATCH", query: { property_id: `eq.${id}`, is_primary: "eq.true" }, body: { is_primary: false, updated_at: now() }, prefer: "return=minimal" });
  await supabaseRestRequest("property_images", { method: "PATCH", query: { id: `eq.${rowId}`, property_id: `eq.${id}` }, body: { is_primary: true, updated_at: now() }, prefer: "return=minimal" });
  return { ok: true };
};

const route = async (event) => {
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (params.propertyId) return getProperty(params.propertyId);
    return listProperties(params);
  }
  if (event.httpMethod !== "POST") fail("Method not allowed.", 405, "method_not_allowed");
  const body = JSON.parse(event.body || "{}"); const action = clean(body.action, 80);
  if (action === "create-property") return createProperty(body.input || {});
  if (action === "update-property") return updateProperty(body.propertyId, body.updates || {});
  if (action === "update-description") return updateDescription(body.propertyId, body.language, body.updates);
  if (action === "add-amenity") return addTextValue("property_amenities", "amenity", body.propertyId, body.amenity);
  if (action === "remove-amenity") return removeRelated("property_amenities", body.propertyId, body.amenityId);
  if (action === "add-tag") return addTextValue("property_tags", "tag", body.propertyId, body.tag);
  if (action === "remove-tag") return removeRelated("property_tags", body.propertyId, body.tagId);
  if (action === "replace-beds") return replaceBeds(body.propertyId, body.beds);
  if (action === "update-pricing") return updatePricing(body.propertyId, body.pricing);
  if (action === "sign-upload") return signUpload(body);
  if (action === "add-image") return addImage(body.propertyId, body.input);
  if (action === "migrate-guesty-image") return migrateGuestyImage(body.propertyId, body.imageId);
  if (action === "update-image") return updateImage(body.propertyId, body.imageId, body.updates);
  if (action === "reorder-images") return reorderImages(body.propertyId, body.orderedImageIds);
  if (action === "set-primary-image") return setPrimaryImage(body.propertyId, body.imageId);
  if (action === "delete-image") return removeRelated("property_images", body.propertyId, body.imageId);
  fail("Unknown property action.");
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: getCorsHeaders(event), body: "" };
  }
  try {
    await verifyAdminsOlsAccess(event);
    return json(200, await route(event), event);
  } catch (error) {
    console.error("[property-admin]", { message: error?.message, code: error?.code, statusCode: error?.statusCode });
    const statusCode = Number(error?.statusCode) || (/duplicate key|unique constraint/i.test(error?.message || "") ? 409 : 500);
    const code = error?.code || (statusCode === 401 ? "unauthorized" : statusCode === 403 ? "forbidden" : statusCode === 404 ? "not_found" : statusCode === 409 ? "duplicate" : "database");
    return json(statusCode, { error: clean(error?.message || "Property request failed.", 800), code }, event);
  }
};
