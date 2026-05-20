// Custom Redondo Beach seasonal pricing override

export const REDONDO_CUSTOM_PRICING = {
  "69725ebda060460014ace222": {
    summer: { months: [6, 7, 8], monthlyPrice: 6500, badge: "Summer Rate" },
    fall: { months: [9, 10, 11], monthlyPrice: 5500, badge: "Fall Rate" },
    winter: { months: [12, 1, 2], monthlyPrice: 4500, badge: "Winter Rate" },
    spring: { months: [3, 4, 5], monthlyPrice: 5500, badge: "Spring Rate" },
  },
};

const parseMonthNumber = (checkInDate) => {
  if (!checkInDate) return null;
  // JS Date months are 0-indexed (Jan=0 ... Dec=11).
  // IMPORTANT: YYYY-MM-DD strings are parsed as UTC by `new Date("YYYY-MM-DD")`,
  // which can shift the local calendar day/month (e.g. PDT) and break season detection.
  // Normalize month using a local date parse for YYYY-MM-DD inputs.
  if (typeof checkInDate === "string") {
    const value = checkInDate.trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month1Based = Number(match[2]);
      const day = Number(match[3]);
      if (!year || !month1Based || !day) return null;
      const local = new Date(year, month1Based - 1, day);
      if (Number.isNaN(local.getTime())) return null;
      return local.getMonth() + 1; // 1-12
    }
  }

  const d = checkInDate instanceof Date ? checkInDate : new Date(checkInDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.getMonth() + 1; // 1-12
};

export const getSeasonalMonthlyPrice = (unitId, checkInDate) => {
  const id = String(unitId || "").trim();
  if (!id) return null;
  const config = REDONDO_CUSTOM_PRICING[id];
  if (!config) return null;
  const month = parseMonthNumber(checkInDate);
  if (!month) return null;

  const match = Object.values(config).find((season) =>
    Array.isArray(season?.months) && season.months.includes(month),
  );
  const price = Number(match?.monthlyPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
};

export const getSeasonalMonthlyPricingMeta = (unitId, checkInDate) => {
  const id = String(unitId || "").trim();
  const config = REDONDO_CUSTOM_PRICING[id];
  if (!config) return null;
  const month = parseMonthNumber(checkInDate);
  if (!month) return null;

  const entry = Object.entries(config).find(([, season]) =>
    Array.isArray(season?.months) && season.months.includes(month),
  );
  if (!entry) return null;
  const [seasonKey, season] = entry;
  const monthlyPrice = getSeasonalMonthlyPrice(id, checkInDate);
  if (monthlyPrice == null) return null;
  return {
    seasonKey,
    badge: season?.badge || "",
    monthlyPrice,
  };
};
