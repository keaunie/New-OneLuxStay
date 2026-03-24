import { getAvailabilityAndPricing as getGuestyAvailabilityAndPricing } from "./guestyService.js";
import {
  getAvailabilityAndPricingFromSupabase,
  isSupabaseAvailabilityEnabled,
  shouldFallbackToGuestyOnSupabaseError,
} from "./supabaseAvailabilityService.js";

export const getAvailabilityAndPricing = async (params = {}) => {
  if (!isSupabaseAvailabilityEnabled()) {
    return getGuestyAvailabilityAndPricing(params);
  }

  try {
    return await getAvailabilityAndPricingFromSupabase(params);
  } catch (error) {
    if (!shouldFallbackToGuestyOnSupabaseError()) {
      throw error;
    }

    console.warn("Supabase availability failed, falling back to Guesty", {
      message: error?.message || String(error),
    });

    return getGuestyAvailabilityAndPricing(params);
  }
};
