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
  }
  push(listing?.description);
  push(listing?.notes);
  if (Array.isArray(listing?.amenities)) listing.amenities.forEach(push);
  if (Array.isArray(listing?.tags)) listing.tags.forEach(push);
  return sources;
};

const addBedsFromText = (map, sources) => {
  if (!sources.length) return;
  const combined = sources.join(" ");
  BED_PATTERNS.forEach(({ label, match }) => {
    const countPattern = new RegExp(`(\\d+)\\s*(?:x\\s*)?${match.source}`, "i");
    const countMatch = combined.match(countPattern);
    if (countMatch) {
      addBed(map, label, Number(countMatch[1]) || 1);
      return;
    }
    if (match.test(combined)) {
      addBed(map, label, 1);
    }
  });
};

const formatBedEntry = (entry) => (entry.count > 1 ? `${entry.label} x${entry.count}` : entry.label);

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

  if (typeof listing?.bedType === "string") {
    addBed(details, listing.bedType, 1);
  }

  addBedsFromText(details, extractTextSources(listing));

  const order = new Map(BED_PATTERNS.map((item, index) => [item.label.toLowerCase(), index]));
  return Array.from(details.values())
    .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
    .map(formatBedEntry);
};

export default getBedDetails;
