const BED_LABELS = {
  KING_BED: "King bed",
  QUEEN_BED: "Queen bed",
  DOUBLE_BED: "Double bed",
  FULL_BED: "Full bed",
  SINGLE_BED: "Single bed",
  TWIN_BED: "Twin bed",
  SOFA_BED: "Sofa bed",
  BUNK_BED: "Bunk bed",
  AIR_MATTRESS: "Air mattress",
  DAYBED: "Daybed",
  MURPHY_BED: "Murphy bed",
  FUTON: "Futon",
  CRIB: "Crib",
  MASTER_BED: "Master bed",
};

const BED_PATTERNS = [
  { label: "Master bed", match: /\bmaster bed\b/i },
  { label: "King bed", match: /\bking(?:-?size)? bed\b/i },
  { label: "Queen bed", match: /\bqueen(?:-?size)? bed\b/i },
  { label: "Double bed", match: /\bdouble bed\b|\bfull(?:-?size)? bed\b/i },
  { label: "Twin bed", match: /\btwin bed\b/i },
  { label: "Single bed", match: /\bsingle bed\b/i },
  { label: "Sofa bed", match: /\bsofa bed\b|\bsleeper sofa\b|\bcouch bed\b|\bpull-?out sofa\b/i },
  { label: "Futon", match: /\bfuton\b/i },
  { label: "Bunk bed", match: /\bbunk bed\b/i },
  { label: "Daybed", match: /\bdaybed\b/i },
  { label: "Murphy bed", match: /\bmurphy bed\b/i },
  { label: "Air mattress", match: /\bair mattress\b/i },
  { label: "Crib", match: /\bcrib\b/i },
];

const BEDROOM_WORDS = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);

const formatBedLabel = (value) => {
  if (!value) return "";
  const key = String(value).toUpperCase().replace(/\s+/g, "_");
  if (BED_LABELS[key]) return BED_LABELS[key];
  const cleaned = String(value)
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
};

const addBed = (map, label, count = 1) => {
  const safeLabel = formatBedLabel(label);
  if (!safeLabel) return;
  const key = safeLabel.toLowerCase();
  const existing = map.get(key);
  if (existing) {
    existing.count += count;
  } else {
    map.set(key, { key, label: safeLabel, count });
  }
};

const parseBedObject = (map, beds) => {
  Object.entries(beds || {}).forEach(([key, value]) => {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return;
    addBed(map, key, count);
  });
};

const parseBedArray = (map, beds) => {
  beds.forEach((entry) => {
    if (!entry) return;
    if (typeof entry === "string") {
      addBed(map, entry, 1);
      return;
    }
    if (typeof entry !== "object") return;
    const label = entry.type || entry.bedType || entry.kind || entry.name || entry.label;
    const count = Number(entry.count ?? entry.quantity ?? entry.amount ?? 1);
    if (label) addBed(map, label, Number.isFinite(count) ? count : 1);
    if (entry.beds && typeof entry.beds === "object") {
      parseBedObject(map, entry.beds);
    }
  });
};

const extractTextSources = (listing) => {
  const sources = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) sources.push(value);
  };
  const description = listing?.publicDescription;
  if (description && typeof description === "object") {
    push(description.summary);
    push(description.description);
    push(description.text);
    push(description.space);
    push(description.access);
    push(description.notes);
    push(description.neighborhood);
    push(description.transit);
    push(description.interactionWithGuests);
  }
  push(listing?.description);
  push(listing?.notes);
  if (Array.isArray(listing?.amenities)) listing.amenities.forEach(push);
  if (Array.isArray(listing?.tags)) listing.tags.forEach(push);
  return sources;
};

const parseBedroomNumber = (text) => {
  if (!text) return null;
  const numberMatch = text.match(/\bbedroom\s*(\d+)\b/i);
  if (numberMatch) return Number(numberMatch[1]);
  const wordMatch = text.match(/\bbedroom\s*(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (wordMatch) return BEDROOM_WORDS.get(wordMatch[1].toLowerCase()) || null;
  return null;
};

const findBedTypeInText = (text) => {
  if (!text) return null;
  const normalized = String(text || "")
    .replace(/[–—-]/g, " ")
    .replace(/\bbeds\b/gi, "bed")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (KING_OR_QUEEN_REGEX.test(normalized)) return KING_OR_QUEEN_LABEL;
  for (const { label, match } of BED_PATTERNS) {
    if (match.test(normalized)) return label;
  }
  return null;
};

const findBedCountInText = (text) => {
  if (!text) return 1;
  const normalized = String(text || "")
    .replace(/[–—-]/g, " ")
    .replace(/\bbeds\b/gi, "bed")
    .replace(/\s+/g, " ")
    .trim();
  const countMatch = normalized.match(/(\d+)\s*(?:x\s*)?(?:king|queen|double|full|twin|single|sofa|futon|bunk|daybed|murphy|air mattress|crib)\b/i);
  if (countMatch) {
    const count = Number(countMatch[1]);
    if (Number.isFinite(count) && count > 0) return count;
  }
  const leadingMatch = normalized.match(/^\s*-\s*(\d+)\b/);
  if (leadingMatch) {
    const count = Number(leadingMatch[1]);
    if (Number.isFinite(count) && count > 0) return count;
  }
  return 1;
};

const extractBedroomBedDetails = (sources) => {
  if (!sources.length) return [];
  const details = [];
  const seen = new Set();
  sources
    .flatMap((text) => text.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (MAIDS_ROOM_REGEX.test(line)) {
        const bedType = findBedTypeInText(line);
        if (!bedType) return;
        const count = findBedCountInText(line);
        const label = `Maids room: ${bedType}${count > 1 ? ` x${count}` : ""}`;
        if (seen.has(label)) return;
        seen.add(label);
        details.push(label);
        return;
      }
      const bedroom = parseBedroomNumber(line);
      if (!bedroom) return;
      const bedType = findBedTypeInText(line);
      if (!bedType) return;
      const count = findBedCountInText(line);
      const label = `Bedroom ${bedroom}: ${bedType}${count > 1 ? ` x${count}` : ""}`;
      if (seen.has(label)) return;
      seen.add(label);
      details.push(label);
    });
  return details;
};

const addBedsFromText = (map, sources) => {
  if (!sources.length) return;
  const combined = sources.join(" ");
  const kingOrQueenMatch = combined.match(
    /(\d+)\s*(?:x\s*)?(?:king|queen)\s*(?:\(|\s*)?(?:or|\/)(?:\)|\s*)\s*(?:queen|king)\b/i
  );
  const hasKingOrQueen = Boolean(kingOrQueenMatch || KING_OR_QUEEN_REGEX.test(combined));
  const combinedWithoutOr = hasKingOrQueen ? combined.replace(KING_OR_QUEEN_REGEX, "") : combined;
  if (hasKingOrQueen) {
    const count = kingOrQueenMatch ? Number(kingOrQueenMatch[1]) || 1 : 1;
    addBed(map, KING_OR_QUEEN_LABEL, count);
  }
  BED_PATTERNS.forEach(({ label, match }) => {
    const targetText =
      label === "King bed" || label === "Queen bed" ? combinedWithoutOr : combined;
    const countPattern = new RegExp(`(\\d+)\\s*(?:x\\s*)?${match.source}`, "i");
    const countMatch = targetText.match(countPattern);
    if (countMatch) {
      addBed(map, label, Number(countMatch[1]) || 1);
      return;
    }
    if (match.test(targetText)) {
      addBed(map, label, 1);
    }
  });
};

const formatBedEntry = (entry) => (entry.count > 1 ? `${entry.label} x${entry.count}` : entry.label);

const LIVING_ROOM_BED_REGEX = /\b(sofa|sleeper|couch|futon|daybed)\b/i;
const MAIDS_ROOM_REGEX = /\bmaid'?s room\b/i;
const KING_OR_QUEEN_REGEX =
  /\bking\b\s*(?:\(|\s*)?(?:or|\/)(?:\)|\s*)\s*\bqueen\b|\bqueen\b\s*(?:\(|\s*)?(?:or|\/)(?:\)|\s*)\s*\bking\b/i;
const KING_OR_QUEEN_LABEL = "King or Queen bed";

const parseBedDetail = (detail) => {
  const trimmed = String(detail || "").trim();
  if (!trimmed) return null;
  const countSuffixMatch = trimmed.match(/^(.*)\s+x(\d+)$/i);
  if (countSuffixMatch) {
    const name = countSuffixMatch[1].trim();
    const count = Number(countSuffixMatch[2]);
    return { name, count: Number.isFinite(count) ? count : 1 };
  }
  const countPrefixMatch = trimmed.match(/^(\d+)\s+(.+)$/);
  if (countPrefixMatch) {
    const count = Number(countPrefixMatch[1]);
    const name = countPrefixMatch[2].trim();
    return { name, count: Number.isFinite(count) ? count : 1 };
  }
  return { name: trimmed, count: 1 };
};

const normalizeBedName = (name) => {
  if (!name) return "";
  const cleaned = String(name).trim();
  if (!cleaned) return "";
  if (KING_OR_QUEEN_REGEX.test(cleaned)) return KING_OR_QUEEN_LABEL;
  if (/^beds?$/i.test(cleaned)) return "Bed";
  return formatBedLabel(cleaned);
};

const normalizeRoomLabel = (value) => {
  if (!value) return "";
  const cleaned = String(value).trim();
  if (!cleaned) return "";
  const bedroomMatch = cleaned.match(/bedroom\s*(\d+)/i);
  if (bedroomMatch) return `Bedroom ${bedroomMatch[1]}`;
  if (/living\s*room/i.test(cleaned)) return "Living room";
  if (MAIDS_ROOM_REGEX.test(cleaned)) return "Maids room";
  if (/bedroom/i.test(cleaned)) return "Bedroom";
  return cleaned;
};

const getRoomLabelForBed = (name) => {
  if (!name) return "";
  if (KING_OR_QUEEN_REGEX.test(name)) return "Bedroom 1";
  return LIVING_ROOM_BED_REGEX.test(name) ? "Living room" : "Bedroom";
};

export const formatBedDetailText = (detail) => {
  const parsed = parseBedDetail(detail);
  if (!parsed) return "";
  const label = normalizeBedName(parsed.name);
  if (!label) return "";
  const raw = String(detail || "");
  const rawLower = raw.toLowerCase();
  let availabilityNote = "";
  if (/\bair mattress\b/i.test(label)) {
    availabilityNote = " (Based on availability)";
  } else if (/\bcrib\b/i.test(label)) {
    availabilityNote = " (Based on availability)";
  }
  if (availabilityNote && rawLower.includes(availabilityNote.toLowerCase())) {
    availabilityNote = "";
  }
  if (parsed.count > 1) return `${parsed.count} ${label}${availabilityNote}`;
  return `${label}${availabilityNote}`;
};

export const splitBedDetailLine = (detail) => {
  const text = String(detail || "").trim();
  if (!text) return { label: "", detail: "" };
  const parts = text.split(":");
  if (parts.length > 1) {
    return {
      label: parts[0].trim(),
      detail: formatBedDetailText(parts.slice(1).join(":").trim()),
    };
  }
  const roomPrefixMatch = text.match(/^(Bedroom\s*\d+|Living\s*room|Maid'?s room)\s*[-]?\s*(.+)$/i);
  if (roomPrefixMatch) {
    return {
      label: normalizeRoomLabel(roomPrefixMatch[1]),
      detail: formatBedDetailText(roomPrefixMatch[2]),
    };
  }
  const roomSuffixMatch = text.match(/^(.+?)\s+in\s+(Bedroom\s*\d+|Living\s*room|Maid'?s room)\b/i);
  if (roomSuffixMatch) {
    return {
      label: normalizeRoomLabel(roomSuffixMatch[2]),
      detail: formatBedDetailText(roomSuffixMatch[1]),
    };
  }
  const parsed = parseBedDetail(text);
  if (parsed && (/\bair mattress\b/i.test(parsed.name) || /\bcrib\b/i.test(parsed.name))) {
    return { label: "", detail: formatBedDetailText(text) };
  }
  return {
    label: parsed ? getRoomLabelForBed(parsed.name) : "",
    detail: formatBedDetailText(text),
  };
};

const getBedDetails = (listing) => {
  if (!listing) return [];
  const details = new Map();

  const bedsValue = listing?.beds;
  if (Array.isArray(bedsValue)) {
    parseBedArray(details, bedsValue);
  } else if (bedsValue && typeof bedsValue === "object") {
    parseBedObject(details, bedsValue);
  }

  if (Array.isArray(listing?.bedrooms)) {
    listing.bedrooms.forEach((room) => {
      if (!room) return;
      if (Array.isArray(room.beds)) parseBedArray(details, room.beds);
      if (room.beds && typeof room.beds === "object") parseBedObject(details, room.beds);
      if (room.bedType) addBed(details, room.bedType, 1);
    });
  }

  if (Array.isArray(listing?.bedroomDetails)) {
    listing.bedroomDetails.forEach((room) => {
      if (!room) return;
      if (Array.isArray(room.beds)) parseBedArray(details, room.beds);
      if (room.beds && typeof room.beds === "object") parseBedObject(details, room.beds);
      if (room.bedType) addBed(details, room.bedType, 1);
    });
  }

  const sources = extractTextSources(listing);
  const bedroomDetails = extractBedroomBedDetails(sources);
  if (bedroomDetails.length) {
    const extraDetails = new Map();
    addBedsFromText(extraDetails, sources);
    const extraItems = Array.from(extraDetails.values())
      .map(formatBedEntry)
      .filter((item) => {
        const needle = item.split(" x")[0].toLowerCase();
        return !bedroomDetails.some((entry) => entry.toLowerCase().includes(needle));
      });
    return [...bedroomDetails, ...extraItems];
  }

  addBedsFromText(details, sources);

  if (typeof listing?.bedType === "string") {
    const parsed = parseBedDetail(listing.bedType);
    if (parsed?.name) {
      const normalized = formatBedLabel(parsed.name);
      const key = normalized.toLowerCase();
      if (!details.has(key)) {
        addBed(details, parsed.name, parsed.count || 1);
      }
    }
  }

  const order = new Map(BED_PATTERNS.map((item, index) => [item.label.toLowerCase(), index]));
  const result = Array.from(details.values())
    .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
    .map(formatBedEntry);
  if (result.length) return result;
  const numericBeds = Number(listing?.beds);
  if (Number.isFinite(numericBeds) && numericBeds > 0) {
    return [`Beds x${numericBeds}`];
  }
  return result;
};

export default getBedDetails;



