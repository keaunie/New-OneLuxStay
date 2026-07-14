import { useEffect, useState } from "react";
import apiBase from "./apiBase";

const DEFAULT_TIERS = Object.freeze({ weekly: 10, biWeekly: 20, monthly: 30 });

export const DEFAULT_PROMO_CONFIG = Object.freeze({
  usa: DEFAULT_TIERS,
  antwerp: DEFAULT_TIERS,
  dubai: DEFAULT_TIERS,
});

export const PROMO_TIERS = Object.freeze([
  { key: "none", label: "None", nights: 0 },
  { key: "weekly", label: "Weekly Promo", nights: 7 },
  { key: "biWeekly", label: "Bi-Weekly Promo", nights: 14 },
  { key: "monthly", label: "Monthly Promo", nights: 28 },
]);

export const isPromoSelectionBlocking = (plan, nights, feedback) => {
  if (!plan?.promoKey || plan.promoKey === "none") return false;
  const stayNights = Number(nights) || 0;
  const requiredNights = Number(plan.requiredNights) || 0;
  return (requiredNights > 0 && stayNights < requiredNights) || feedback?.tone === "error";
};

const normalizePercent = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(90, Math.max(0, Math.round(parsed))) : fallback;
};

const normalizeTiers = (value = {}, fallback = DEFAULT_TIERS) => ({
  weekly: normalizePercent(value.weekly, fallback.weekly),
  biWeekly: normalizePercent(value.biWeekly, fallback.biWeekly),
  monthly: normalizePercent(value.monthly, fallback.monthly),
});

export const normalizePromoConfig = (value = {}, region = "") => {
  const legacyTiers = value?.weekly !== undefined ? normalizeTiers(value) : null;
  const normalized = {
    usa: normalizeTiers(value.usa || legacyTiers || DEFAULT_TIERS),
    antwerp: normalizeTiers(value.antwerp || legacyTiers || DEFAULT_TIERS),
    dubai: normalizeTiers(value.dubai || legacyTiers || DEFAULT_TIERS),
  };
  return region ? normalized[region] || normalized.usa : normalized;
};

export const usePromoConfig = (region = "usa") => {
  const [promoConfig, setPromoConfig] = useState(DEFAULT_PROMO_CONFIG[region] || DEFAULT_PROMO_CONFIG.usa);

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/promo-config`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload?.promos) setPromoConfig(normalizePromoConfig(payload.promos, region));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [region]);

  return promoConfig;
};

export const validatePromoExtension = async ({ planId, checkIn, checkOut, listingIds, guests }) => {
  const promoKey = String(planId || "").split("::").pop();
  const tier = PROMO_TIERS.find((item) => item.key === promoKey);
  if (!tier) return { ok: false, message: "This promo is not recognized." };
  if (tier.key === "none") return { ok: true, tier, nextCheckOut: checkOut, unchanged: true };
  if (!checkIn) return { ok: false, tier, message: "Select a check-in date before choosing a promo." };

  const start = new Date(`${checkIn}T12:00:00`);
  const end = checkOut ? new Date(`${checkOut}T12:00:00`) : null;
  const currentNights = end && !Number.isNaN(end.getTime())
    ? Math.round((end.getTime() - start.getTime()) / 86400000)
    : 0;
  if (currentNights >= tier.nights) {
    return { ok: true, tier, nextCheckOut: checkOut, unchanged: true, currentNights };
  }

  start.setDate(start.getDate() + tier.nights);
  const nextCheckOut = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, "0"), String(start.getDate()).padStart(2, "0")].join("-");
  const ids = [...new Set((listingIds || []).filter(Boolean).map(String))];
  if (!ids.length) return { ok: false, tier, message: "No property was found for this promo." };
  const query = new URLSearchParams({
    ids: ids.join(","),
    checkIn,
    checkOut: nextCheckOut,
    minOccupancy: guests || "1",
  });
  const response = await fetch(`${apiBase}/check-units/listings/availability-query?${query}`, { cache: "no-store" });
  if (!response.ok) return { ok: false, tier, message: "Unable to verify the extended promo dates." };
  const payload = await response.json();
  if (!Array.isArray(payload?.results) || !payload.results.length) {
    return {
      ok: false,
      tier,
      message: `${tier.label} cannot be applied. A ${tier.nights}-night stay through ${nextCheckOut} is unavailable. Your dates were not changed.`,
    };
  }
  return { ok: true, tier, nextCheckOut, unchanged: false, currentNights };
};
