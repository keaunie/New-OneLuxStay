const getDimensionFromUrl = (url, key) => {
  if (!url) return null;
  const value = String(url).toLowerCase();
  const queryMatch = value.match(new RegExp(`[?&]${key}(?:idth)?=([0-9]{2,4})`));
  if (queryMatch) return Number.parseInt(queryMatch[1], 10);
  const pathMatch = value.match(new RegExp(`(?:^|[\\/_,])${key}(?:idth)?[_-]([0-9]{2,4})`));
  if (pathMatch) return Number.parseInt(pathMatch[1], 10);
  return null;
};

const normalizeImageUrlForKey = (url) => {
  if (!url) return "";
  const clean = String(url).split("?")[0].toLowerCase();
  const uploadMarker = "/image/upload/";
  const idx = clean.indexOf(uploadMarker);
  if (idx === -1) return clean;
  let tail = clean.slice(idx + uploadMarker.length);
  const segments = tail.split("/");
  if (!segments.length) return clean;
  const first = segments[0];
  const hasTransformToken = /(^|,)(w|h|c|q|f|g|dpr|ar|fit|crop|pad|bg)_/i.test(first) || first.includes(",");
  if (hasTransformToken && segments.length > 1) {
    segments.shift();
    tail = segments.join("/");
  }
  return tail || clean;
};

export const getImageKeyFromUrl = (url) => {
  const normalized = normalizeImageUrlForKey(url);
  if (!normalized) return "";
  const parts = normalized.split("/");
  const filename = parts[parts.length - 1] || "";
  const base = filename.split(".")[0];
  return base || normalized;
};

export const isLowQualityImageUrl = (url, minSize = 360) => {
  if (!url) return true;
  const width = getDimensionFromUrl(url, "w");
  const height = getDimensionFromUrl(url, "h");
  if (Number.isFinite(width) && width < minSize) return true;
  if (Number.isFinite(height) && height < minSize) return true;
  if (Number.isFinite(width) && Number.isFinite(height)) {
    const minDim = Math.min(width, height);
    if (minDim < minSize) return true;
  }
  return false;
};

const hasImageExtension = (url) => {
  if (!url) return false;
  const raw = String(url).trim().toLowerCase();
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return true;
  const path = raw.split("?")[0].split("#")[0];
  const lastSegment = path.split("/").pop() || "";
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(lastSegment);
};

export const filterLowQualityImages = (urls = [], minSize = 360) => {
  if (!Array.isArray(urls)) return [];
  const filtered = urls.filter((url) => {
    if (!hasImageExtension(url)) return false;
    return !isLowQualityImageUrl(url, minSize);
  });
  return filtered.length ? filtered : urls;
};
