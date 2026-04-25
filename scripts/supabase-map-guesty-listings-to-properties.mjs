import dotenv from "dotenv";
import { guestyRequest } from "../netlify/functions/_shared/guestyService.js";
import { supabaseRestRequest } from "../netlify/functions/_shared/supabaseClient.js";

dotenv.config();

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (prefix) => args.find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1) || null;

const APPLY = hasFlag("--apply");
const DRY_RUN = !APPLY;

const MAX_PROPERTIES = Math.max(1, Number(getArg("--max-properties") || 5000) || 5000);
const GUESTY_PAGE_SIZE = Math.max(50, Math.min(200, Number(getArg("--guesty-page-size") || 200) || 200));
const MAX_GUESTY_PAGES = Math.max(1, Number(getArg("--max-guesty-pages") || 100) || 100);
const DISTANCE_METERS = Math.max(25, Number(getArg("--max-distance-m") || 250) || 250);
const MIN_NAME_SCORE = Math.max(0, Math.min(1, Number(getArg("--min-name-score") || 0.45) || 0.45));
const MIN_SCORE_DELTA = Math.max(0, Math.min(1, Number(getArg("--min-score-delta") || 0.1) || 0.1));
const DEBUG_AMBIGUOUS = Math.max(0, Math.min(100, Number(getArg("--debug-ambiguous") || 0) || 0));
const MIN_DELAY_MS = Math.max(0, Number(getArg("--delay-ms") || 250) || 250);

const ONLY_UNMAPPED = !hasFlag("--include-mapped");
const INCLUDE_DUMMY = hasFlag("--include-dummy");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeString = (value) => String(value ?? "").trim();
const normalizeKey = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[#.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMatchText = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) => {
  const raw = normalizeMatchText(value);
  if (!raw) return [];
  const stop = new Set([
    "a",
    "an",
    "and",
    "apt",
    "apartment",
    "by",
    "home",
    "house",
    "in",
    "of",
    "on",
    "one",
    "oneluxstay",
    "room",
    "stay",
    "studio",
    "suite",
    "the",
    "to",
    "unit",
    "vr",
    "with",
  ]);
  return raw
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !stop.has(t));
};

const f1TokenSimilarity = (a, b) => {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let common = 0;
  for (const t of aSet) if (bSet.has(t)) common += 1;

  const precision = common / bSet.size;
  const recall = common / aSet.size;
  if (!precision || !recall) return 0;
  return (2 * precision * recall) / (precision + recall);
};

const toRoundedInt = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.round(num));
};

const toNumber = (value) => {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const readGuestyListingId = (listing) =>
  normalizeString(listing?._id || listing?.id || listing?.listingId);

const readGuestyListingName = (listing) =>
  normalizeString(listing?.nickname || listing?.title || listing?.name || "");

const readGuestyListingStats = (listing) => ({
  bedrooms: toRoundedInt(listing?.bedrooms || listing?.bedroomCount),
  bathrooms: toRoundedInt(listing?.bathrooms || listing?.bathroomCount),
  accommodates: toRoundedInt(listing?.accommodates || listing?.capacity || listing?.guests),
});

const readGuestyLatLng = (listing) => {
  const lat = toNumber(listing?.address?.lat || listing?.address?.latitude || listing?.location?.lat);
  const lng = toNumber(listing?.address?.lng || listing?.address?.longitude || listing?.location?.lng);
  return { lat, lng };
};

const readGuestyAddressKey = (listing) => {
  const full = normalizeString(listing?.address?.full || listing?.address?.address || "");
  const city = normalizeString(listing?.address?.city || "");
  const country = normalizeString(listing?.address?.country || "");
  return normalizeKey([full, city, country].filter(Boolean).join(", "));
};

const fetchAllGuestyListings = async () => {
  const fields = [
    "_id",
    "title",
    "nickname",
    "bedrooms",
    "bathrooms",
    "accommodates",
    "address.full",
    "address.city",
    "address.country",
    "address.lat",
    "address.lng",
    "active",
    "listed",
    "pmsActive",
  ].join(" ");

  const all = [];
  for (let page = 0; page < MAX_GUESTY_PAGES; page += 1) {
    const skip = page * GUESTY_PAGE_SIZE;
    const params = new URLSearchParams({
      limit: String(GUESTY_PAGE_SIZE),
      skip: String(skip),
      fields,
      active: "true",
      listed: "true",
      pmsActive: "true",
    });
    const payload = await guestyRequest(`/listings?${params.toString()}`);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) break;
    all.push(...results);
    if (results.length < GUESTY_PAGE_SIZE) break;
  }
  return all;
};

const fetchProperties = async () => {
  try {
    const selectWithCode = "id,name,property_code,address,city,country,latitude,longitude,bedrooms,bathrooms,accommodates,guesty_listing_id";
    const selectWithoutCode = "id,name,address,city,country,latitude,longitude,bedrooms,bathrooms,accommodates,guesty_listing_id";

    try {
      const rows = await supabaseRestRequest("properties", {
        query: {
          select: selectWithCode,
          limit: Math.min(1000, MAX_PROPERTIES),
          offset: 0,
        },
      });
      return Array.isArray(rows) ? rows.slice(0, MAX_PROPERTIES) : [];
    } catch (error) {
      const msg = String(error?.message || "");
      if (msg.includes("property_code") && msg.includes("does not exist")) {
        console.log("note: `properties.property_code` column not found; mapping will use `properties.name` only.");
        console.log("");
        const rows = await supabaseRestRequest("properties", {
          query: {
            select: selectWithoutCode,
            limit: Math.min(1000, MAX_PROPERTIES),
            offset: 0,
          },
        });
        return Array.isArray(rows) ? rows.slice(0, MAX_PROPERTIES) : [];
      }
      if (msg.includes("does not exist") || msg.includes("column") || msg.includes("Unknown field")) {
        console.log(`note: properties column mismatch (${msg}); falling back to select="*".`);
        console.log("");
        const rows = await supabaseRestRequest("properties", {
          query: {
            select: "*",
            limit: Math.min(1000, MAX_PROPERTIES),
            offset: 0,
          },
        });
        return Array.isArray(rows) ? rows.slice(0, MAX_PROPERTIES) : [];
      }
      throw error;
    }
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("guesty_listing_id") && msg.includes("does not exist")) {
      console.error("Supabase is missing `properties.guesty_listing_id`.");
      console.error("Apply migration: `supabase/migrations/20260423102000_add_properties_guesty_listing_id.sql`.");
      process.exitCode = 2;
      return [];
    }
    throw error;
  }
};

const updatePropertyMapping = async (propertyId, guestyListingId) => {
  if (DRY_RUN) return;
  await supabaseRestRequest("properties", {
    method: "PATCH",
    query: { id: `eq.${propertyId}` },
    body: { guesty_listing_id: guestyListingId },
    prefer: "return=minimal",
  });
};

const buildPropertyAddressKey = (property) => {
  const address = normalizeString(property?.address);
  const city = normalizeString(property?.city);
  const country = normalizeString(property?.country);
  return normalizeKey([address, city, country].filter(Boolean).join(", "));
};

const buildPropertyNameKey = (property) => {
  const name = normalizeString(property?.name);
  const code = normalizeString(property?.property_code);
  return [name, code].filter(Boolean).join(" ");
};

const extractPropertyUnitToken = (property) => {
  const candidates = [
    normalizeString(property?.address),
    normalizeString(property?.name),
    normalizeString(property?.property_code),
  ].filter(Boolean);

  for (const text of candidates) {
    const match = text.match(/\b(?:apt|apartment|unit|suite|ste|#)\s*([a-z]?\d{1,5}[a-z]?)\b/i);
    if (match?.[1]) return normalizeString(match[1]).toLowerCase();
  }

  return "";
};

const propertyStatsFromName = (property) => {
  const name = normalizeString(property?.name);
  if (!name) return { bedrooms: null, bathrooms: null, accommodates: null };

  const br = name.match(/\b(\d{1,2})\s*br\b/i);
  const ba = name.match(/\b(\d{1,2})(?:\.(\d))?\s*ba\b/i);
  const bathrooms =
    ba && ba[1]
      ? Number.isFinite(Number(ba[1]))
        ? Number(ba[1]) + (ba[2] ? Number(ba[2]) / 10 : 0)
        : null
      : null;

  return {
    bedrooms: br?.[1] ? toRoundedInt(br[1]) : null,
    bathrooms: bathrooms != null ? bathrooms : null,
    accommodates: null,
  };
};

const readPropertyStats = (property) => ({
  bedrooms: toRoundedInt(property?.bedrooms) ?? propertyStatsFromName(property).bedrooms,
  bathrooms: toRoundedInt(property?.bathrooms) ?? (propertyStatsFromName(property).bathrooms != null ? Number(propertyStatsFromName(property).bathrooms) : null),
  accommodates: toRoundedInt(property?.accommodates || property?.capacity) ?? propertyStatsFromName(property).accommodates,
});

const narrowCandidatesByStats = (property, candidates) => {
  const p = readPropertyStats(property);
  if (!p.bedrooms && !p.bathrooms && !p.accommodates) return candidates;

  const steps = [
    {
      key: "bedrooms",
      match: (c) => {
        const { bedrooms } = readGuestyListingStats(c);
        return bedrooms != null && p.bedrooms != null && bedrooms === p.bedrooms;
      },
    },
    // Bathrooms can be fractional in some schemas; use rounded int match.
    {
      key: "bathrooms",
      match: (c) => {
        const { bathrooms } = readGuestyListingStats(c);
        const pRounded = toRoundedInt(p.bathrooms);
        return bathrooms != null && pRounded != null && bathrooms === pRounded;
      },
    },
    {
      key: "accommodates",
      match: (c) => {
        const { accommodates } = readGuestyListingStats(c);
        return accommodates != null && p.accommodates != null && accommodates === p.accommodates;
      },
    },
  ];

  let current = candidates;
  for (const step of steps) {
    const filtered = current.filter(step.match);
    if (filtered.length && filtered.length < current.length) current = filtered;
  }
  return current;
};

const narrowCandidatesByUnitToken = (unitToken, candidates) => {
  if (!unitToken) return candidates;
  const matchOne = (listing) => {
    const name = normalizeMatchText(readGuestyListingName(listing));
    const address = normalizeMatchText(normalizeString(listing?.address?.full || listing?.address?.address || ""));
    return name.includes(unitToken) || address.includes(unitToken);
  };
  const filtered = candidates.filter(matchOne);
  return filtered.length ? filtered : candidates;
};

const chooseBestCandidate = ({ property, candidates, candidatesWithDistance = [] }) => {
  if (!Array.isArray(candidates) || !candidates.length) return { best: null, reason: "no_candidates" };
  const unitToken = extractPropertyUnitToken(property);
  const withUnit = narrowCandidatesByUnitToken(unitToken, candidates);
  const narrowed = narrowCandidatesByStats(property, withUnit);
  if (narrowed.length === 1) return { best: narrowed[0], reason: "single_candidate_after_stats" };
  const pool = narrowed;
  if (pool.length === 1) return { best: pool[0], reason: "single_candidate" };
  if (pool.length === 0) return { best: null, reason: "no_candidates_after_stats" };

  const propertyName = buildPropertyNameKey(property);
  if (!propertyName) return { best: null, reason: "missing_property_name" };

  const withScores = pool.map((listing) => {
    const listingName = readGuestyListingName(listing);
    const score = f1TokenSimilarity(propertyName, listingName);
    const id = readGuestyListingId(listing);
    const distance =
      candidatesWithDistance.find((row) => readGuestyListingId(row.listing) === id)?.distance ?? null;
    return { listing, score, listingName, distance };
  });

  withScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDist = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Number.POSITIVE_INFINITY;
    const bDist = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Number.POSITIVE_INFINITY;
    return aDist - bDist;
  });

  const best = withScores[0];
  const second = withScores[1] || { score: 0 };
  const okByScore = best.score >= MIN_NAME_SCORE;
  const okByDelta = best.score - second.score >= MIN_SCORE_DELTA;

  if (okByScore && okByDelta) return { best: best.listing, reason: `name_score:${best.score.toFixed(2)}` };
  return {
    best: null,
    reason: `ambiguous:name_scores best=${best.score.toFixed(2)} second=${second.score.toFixed(2)}`,
  };
};

const summarizeCandidates = ({ property, candidates, candidatesWithDistance = [] }) => {
  const propertyName = buildPropertyNameKey(property);
  const unitToken = extractPropertyUnitToken(property);
  const narrowed = narrowCandidatesByStats(property, narrowCandidatesByUnitToken(unitToken, candidates));
  const top = narrowed
    .map((listing) => {
      const id = readGuestyListingId(listing);
      const name = readGuestyListingName(listing);
      const stats = readGuestyListingStats(listing);
      const distance =
        candidatesWithDistance.find((row) => readGuestyListingId(row.listing) === id)?.distance ?? null;
      const score = propertyName ? f1TokenSimilarity(propertyName, name) : 0;
      return { id, name, score, distance, ...stats };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    propertyId: normalizeString(property?.id),
    propertyName,
    propertyStats: readPropertyStats(property),
    unitToken: unitToken || null,
    candidatesTotal: candidates.length,
    candidatesAfterStats: narrowed.length,
    top,
  };
};

const main = async () => {
  console.log(`Mapping Guesty listings to Supabase properties (${DRY_RUN ? "dry-run" : "apply"}).`);
  console.log(
    `maxProperties=${MAX_PROPERTIES} guestyPageSize=${GUESTY_PAGE_SIZE} maxGuestyPages=${MAX_GUESTY_PAGES} maxDistanceM=${DISTANCE_METERS} minNameScore=${MIN_NAME_SCORE} minScoreDelta=${MIN_SCORE_DELTA} includeDummy=${INCLUDE_DUMMY}`,
  );
  console.log("");

  const guestyListingsRaw = await fetchAllGuestyListings();
  const guestyListings = guestyListingsRaw.filter((listing) => {
    const id = readGuestyListingId(listing);
    if (!id) return false;
    if (INCLUDE_DUMMY) return true;
    const name = readGuestyListingName(listing);
    return !/(^|\b)(dummy|test|sample)(\b|$)/i.test(name);
  });
  const guestyByAddress = new Map();
  for (const listing of guestyListings) {
    const id = readGuestyListingId(listing);
    if (!id) continue;
    const key = readGuestyAddressKey(listing);
    if (!key) continue;
    if (!guestyByAddress.has(key)) guestyByAddress.set(key, []);
    guestyByAddress.get(key).push(listing);
  }

  const properties = await fetchProperties();
  if (!properties.length && process.exitCode === 2) {
    console.log("");
    console.log("Re-run after applying the migration:");
    console.log("- `npm run supabase:map:guesty-listings -- --apply`");
    process.exitCode = 2;
    return;
  }

  let mapped = 0;
  let alreadyMapped = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const ambiguousSamples = [];

  for (const property of properties) {
    const propertyId = normalizeString(property?.id);
    const existing = normalizeString(property?.guesty_listing_id);

    if (!propertyId) continue;
    if (existing) {
      alreadyMapped += 1;
      if (ONLY_UNMAPPED) continue;
    }

    const pLat = toNumber(property?.latitude);
    const pLng = toNumber(property?.longitude);

    if (pLat != null && pLng != null) {
      const nearby = [];
      for (const listing of guestyListings) {
        const { lat, lng } = readGuestyLatLng(listing);
        if (lat == null || lng == null) continue;
        const d = haversineMeters(pLat, pLng, lat, lng);
        if (d <= DISTANCE_METERS) nearby.push({ listing, distance: d });
      }
      nearby.sort((a, b) => a.distance - b.distance);
      const nearbyListings = nearby.map((row) => row.listing);

      if (nearbyListings.length === 1) {
        const guestyId = readGuestyListingId(nearbyListings[0]);
        if (guestyId) {
          await updatePropertyMapping(propertyId, guestyId);
          mapped += 1;
          if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
          continue;
        }
      }

      if (nearbyListings.length > 1) {
        const choice = chooseBestCandidate({ property, candidates: nearbyListings, candidatesWithDistance: nearby });
        if (choice.best) {
          const guestyId = readGuestyListingId(choice.best);
          if (guestyId) {
            await updatePropertyMapping(propertyId, guestyId);
            mapped += 1;
            if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
            continue;
          }
        }
      }
    }

    const addressKey = buildPropertyAddressKey(property);
    const candidates = guestyByAddress.get(addressKey) || [];
    if (candidates.length === 1) {
      const guestyId = readGuestyListingId(candidates[0]);
      if (guestyId) {
        await updatePropertyMapping(propertyId, guestyId);
        mapped += 1;
        if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
        continue;
      }
    } else if (candidates.length > 1) {
      const pLat = toNumber(property?.latitude);
      const pLng = toNumber(property?.longitude);
      const withDistance =
        pLat != null && pLng != null
          ? candidates
              .map((listing) => {
                const { lat, lng } = readGuestyLatLng(listing);
                if (lat == null || lng == null) return null;
                return { listing, distance: haversineMeters(pLat, pLng, lat, lng) };
              })
              .filter(Boolean)
          : [];
      const choice = chooseBestCandidate({ property, candidates, candidatesWithDistance: withDistance });
      if (choice.best) {
        const guestyId = readGuestyListingId(choice.best);
        if (guestyId) {
          await updatePropertyMapping(propertyId, guestyId);
          mapped += 1;
          if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
          continue;
        }
      }
    }

    if (candidates.length > 1) {
      ambiguous += 1;
      if (DEBUG_AMBIGUOUS && ambiguousSamples.length < DEBUG_AMBIGUOUS) {
        const pLat = toNumber(property?.latitude);
        const pLng = toNumber(property?.longitude);
        const withDistance =
          pLat != null && pLng != null
            ? candidates
                .map((listing) => {
                  const { lat, lng } = readGuestyLatLng(listing);
                  if (lat == null || lng == null) return null;
                  return { listing, distance: haversineMeters(pLat, pLng, lat, lng) };
                })
                .filter(Boolean)
            : [];
        ambiguousSamples.push(summarizeCandidates({ property, candidates, candidatesWithDistance: withDistance }));
      }
    } else {
      unmatched += 1;
    }
  }

  console.log("Done.");
  console.log(`properties_total: ${properties.length}`);
  console.log(`guesty_listings_total: ${guestyListings.length}`);
  console.log(`mapped_now: ${mapped}`);
  console.log(`already_mapped: ${alreadyMapped}`);
  console.log(`ambiguous: ${ambiguous}`);
  console.log(`unmatched: ${unmatched}`);
  console.log("");
  if (ambiguousSamples.length) {
    console.log("Ambiguous samples (top candidates by name score):");
    for (const sample of ambiguousSamples) {
      console.log(
        `- property=${sample.propertyId} name="${sample.propertyName}" unit=${sample.unitToken || "?"} stats=${JSON.stringify(sample.propertyStats)} candidates=${sample.candidatesTotal} narrowed=${sample.candidatesAfterStats}`,
      );
      for (const cand of sample.top) {
        console.log(
          `  - guesty=${cand.id} score=${cand.score.toFixed(2)} dist=${cand.distance ?? "?"} beds=${cand.bedrooms ?? "?"} baths=${cand.bathrooms ?? "?"} occ=${cand.accommodates ?? "?"} name="${cand.name}"`,
        );
      }
    }
    console.log("");
  }
  console.log("Next: run `npm run supabase:sync:property-nightly-prices -- --apply` to backfill pricing.");
};

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
