const getDimensionFromUrl = (url, key) => {
  if (!url) return null;
  const value = String(url).toLowerCase();
  const queryMatch = value.match(new RegExp(`[?&]${key}(?:idth)?=([0-9]{2,4})`));
  if (queryMatch) return Number.parseInt(queryMatch[1], 10);
  const pathMatch = value.match(new RegExp(`(?:^|[\\/_,])${key}(?:idth)?[_-]([0-9]{2,4})`));
  if (pathMatch) return Number.parseInt(pathMatch[1], 10);
  return null;
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

export const filterLowQualityImages = (urls = [], minSize = 360) => {
  if (!Array.isArray(urls)) return [];
  const filtered = urls.filter((url) => !isLowQualityImageUrl(url, minSize));
  return filtered.length ? filtered : urls;
};
